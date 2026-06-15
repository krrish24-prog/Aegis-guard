import { db } from '../firebase';
import { authenticatedFetch } from './apiClient';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { SecurityService, SecurityAnalysis } from './securityService';
import type { ThreatIntelligenceReport, ThreatIndicator, UrlScanResult, AttachmentScanResult } from '../types';

const MALICIOUS_DOMAINS = [
  'g00gle.com', 'paypa1.com', 'amaz0n.com', 'micros0ft.com',
  'bank-login.xyz', 'secure-update.top', 'account-verify.icu',
];

const SUSPICIOUS_TLDS = ['.xyz', '.top', '.icu', '.work', '.click', '.buzz', '.loan'];

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

export class ThreatIntelligenceService {
  private static async hashContent(content: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  static extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX) ?? [];
    return [...new Set(matches)];
  }

  static scanUrlsLocally(urls: string[]): UrlScanResult[] {
    return urls.map((url) => {
      let domain = '';
      try { domain = new URL(url).hostname.toLowerCase(); } catch { domain = url; }

      const isMaliciousDomain = MALICIOUS_DOMAINS.some((d) => domain.includes(d));
      const isSuspiciousTld = SUSPICIOUS_TLDS.some((tld) => domain.endsWith(tld));
      const hasObfuscation = /%[0-9a-f]{2}/i.test(url) || url.length > 200;
      const isIpAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain);

      const isSafe = !isMaliciousDomain && !isSuspiciousTld && !hasObfuscation && !isIpAddress;
      let threatType = 'none';
      if (isMaliciousDomain) threatType = 'phishing';
      else if (isSuspiciousTld) threatType = 'suspicious_tld';
      else if (hasObfuscation) threatType = 'obfuscated_url';
      else if (isIpAddress) threatType = 'ip_direct';

      return { url, isSafe, threatType, domain, reputation: isSafe ? 'clean' : 'flagged' };
    });
  }

  static async scanAttachment(
    fileName: string,
    mimeType: string,
    fileData?: string
  ): Promise<AttachmentScanResult> {
    const findings: string[] = [];
    let malwareScore = 0;

    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js', '.jar', '.msi', '.ps1'];
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    if (dangerousExtensions.includes(ext)) {
      findings.push(`Dangerous file extension: ${ext}`);
      malwareScore += 80;
    }

    if (mimeType === 'application/x-msdownload' || mimeType === 'application/javascript') {
      findings.push(`Suspicious MIME type: ${mimeType}`);
      malwareScore += 60;
    }

    if (fileData && fileData.length > 10_000_000) {
      findings.push('Unusually large attachment');
      malwareScore += 10;
    }

    return {
      fileName,
      mimeType,
      isSafe: malwareScore < 50,
      malwareScore: Math.min(100, malwareScore),
      findings,
    };
  }

  static async fullScan(
    userId: string,
    content: string,
    options?: {
      messageId?: string;
      chatId?: string;
      fileDataInfo?: { data: string; mimeType: string };
      fileName?: string;
    }
  ): Promise<ThreatIntelligenceReport> {
    const contentHash = await this.hashContent(content + (options?.fileDataInfo?.data?.slice(0, 500) ?? ''));
    const indicators: ThreatIndicator[] = [];

    const urls = this.extractUrls(content);
    const urlScanResults = this.scanUrlsLocally(urls);
    for (const result of urlScanResults) {
      if (!result.isSafe) {
        indicators.push({
          type: 'malicious_url',
          confidence: 0.85,
          description: `Suspicious URL detected: ${result.domain} (${result.threatType})`,
          source: 'static',
        });
      }
    }

    let attachmentScan: AttachmentScanResult | undefined;
    if (options?.fileDataInfo) {
      attachmentScan = await this.scanAttachment(
        options.fileName ?? 'attachment',
        options.fileDataInfo.mimeType,
        options.fileDataInfo.data
      );
      if (!attachmentScan.isSafe) {
        indicators.push({
          type: 'malware',
          confidence: attachmentScan.malwareScore / 100,
          description: `Attachment risk score: ${attachmentScan.malwareScore}/100`,
          source: 'static',
        });
      }
    }

    const phishPatterns = /urgent|verify.{0,20}account|password.{0,10}expir|click.{0,10}here|act.{0,5}now|suspended|unusual.{0,10}activity/i;
    if (phishPatterns.test(content)) {
      indicators.push({
        type: 'phishing',
        confidence: 0.7,
        description: 'Phishing language patterns detected',
        source: 'static',
      });
    }

    let aiAnalysis: SecurityAnalysis | null = null;
    try {
      aiAnalysis = await SecurityService.analyzeMessage(content, options?.fileDataInfo);
      if (!aiAnalysis.isSafe) {
        indicators.push({
          type: aiAnalysis.threatType as ThreatIndicator['type'],
          confidence: (100 - aiAnalysis.score) / 100,
          description: aiAnalysis.summary,
          source: 'ai',
        });
      }
    } catch {
      indicators.push({
        type: 'none',
        confidence: 0,
        description: 'AI analysis unavailable — manual review recommended',
        source: 'ai',
      });
    }

    const riskScore = indicators.length === 0
      ? (aiAnalysis?.score ?? 100)
      : Math.max(0, 100 - indicators.reduce((sum, i) => sum + i.confidence * 30, 0));

    const isSafe = riskScore >= 70 && indicators.filter((i) => i.type !== 'none').length === 0;

    let aiExplanation: string | undefined;
    let incidentReport: string | undefined;
    if (!isSafe || indicators.length > 0) {
      try {
        const explainRes = await authenticatedFetch('/api/threat-explain', {
          method: 'POST',
          body: JSON.stringify({ content, indicators, urlScanResults, attachmentScan }),
        });
        if (explainRes.ok) {
          const data = await explainRes.json();
          aiExplanation = data.explanation;
          incidentReport = data.incidentReport;
        }
      } catch { /* server endpoint optional */ }
    }

    const report: ThreatIntelligenceReport = {
      id: contentHash,
      messageId: options?.messageId,
      chatId: options?.chatId,
      userId,
      contentHash,
      isSafe,
      riskScore: Math.round(riskScore),
      threatCategory: indicators[0]?.type ?? 'none',
      indicators,
      urlScanResults: urlScanResults.length > 0 ? urlScanResults : undefined,
      attachmentScan,
      aiExplanation,
      incidentReport,
      timestamp: serverTimestamp() as ThreatIntelligenceReport['timestamp'],
    };

    try {
      await setDoc(doc(db, 'threat_intelligence', contentHash), report);
    } catch (err) {
      console.error('[ThreatIntel] Cache write failed:', err);
    }

    return report;
  }

  static async getCachedReport(contentHash: string): Promise<ThreatIntelligenceReport | null> {
    const snap = await getDoc(doc(db, 'threat_intelligence', contentHash));
    return snap.exists() ? (snap.data() as ThreatIntelligenceReport) : null;
  }
}
