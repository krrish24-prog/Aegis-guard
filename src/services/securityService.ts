import { authenticatedFetch } from "./apiClient";

export interface SecurityAnalysis {
  isSafe: boolean;
  score: number; // 0 (Dangerous) to 100 (Safe)
  threatType: 'none' | 'phishing' | 'malicious_link' | 'steganography' | 'cryptography';
  summary: string;
  points: string[];
  steganographyReport: string;
  isAnalyzed: boolean;
}

export interface GroupVerification {
  isVerified: boolean;
  status: 'verified' | 'suspicious' | 'unverified';
  reason: string;
  threatMarkers: string[];
  timestamp: number;
}

/** Fail-closed result when analysis cannot complete. */
const ANALYSIS_UNAVAILABLE: SecurityAnalysis = {
  isSafe: false,
  score: 0,
  threatType: 'phishing',
  summary: "Security analysis unavailable — message blocked pending review.",
  points: ["Automated scan could not complete", "Treat content as potentially unsafe"],
  steganographyReport: "Scan failed",
  isAnalyzed: false,
};

const GROUP_VERIFICATION_UNAVAILABLE: GroupVerification = {
  isVerified: false,
  status: 'unverified',
  reason: "Verification service unavailable — proceed with caution.",
  threatMarkers: ["Service Error"],
  timestamp: Date.now(),
};

export class SecurityService {
  private static analysisCache = new Map<string, SecurityAnalysis>();

  private static normalizeScore(result: any, content: string): number {
    const raw = Number(result.score);
    if (Number.isFinite(raw) && raw >= 0 && raw <= 100) return Math.round(raw);
    if (result.isSafe === true) return 95;
    const text = `${content} ${result.summary || ''} ${(result.points || []).join(' ')}`.toLowerCase();
    if (/otp|password|pin|bank|wallet|payment|urgent|verify/.test(text)) return 12;
    if (/g00gle|homograph|fake|phishing|malicious|deceive|suspicious link/.test(text)) return 18;
    if (/http|\.com|\.xyz|\.top|\.site/.test(text)) return 35;
    return 55;
  }

  private static async hashContent(content: string, imageUrl?: string): Promise<string> {
    const input = content + (imageUrl ? imageUrl.substring(0, 1000) : '');
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  static async analyzeMessage(content: string, fileDataInfo?: { data: string, mimeType: string }): Promise<SecurityAnalysis> {
    const contentHash = await this.hashContent(content, fileDataInfo?.data);

    try {
      const cached = this.analysisCache.get(contentHash);
      if (cached) return cached;

      const phishRegex = /g00gle\.com|bank-login\.xyz|giveaway|bank-login|account-update|payment-failed/i;
      if (phishRegex.test(content) || (content.length > 20 && /[a-z0-9]{10,}\.(xyz|top|site|icu|work)/i.test(content))) {
         const ret: SecurityAnalysis = {
          isSafe: false, score: 10, threatType: 'phishing',
          summary: "Suspicious pattern detected by static analyzer.",
          points: ["Suspicious domain or keywords detected."],
          steganographyReport: "N/A", isAnalyzed: true
        };
        this.analysisCache.set(contentHash, ret);
        return ret;
      }

      const res = await authenticatedFetch("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ content, contentHash, fileDataInfo })
      });

      if (!res.ok) {
        return ANALYSIS_UNAVAILABLE;
      }

      const responsePayload = await res.json();
      const text = typeof responsePayload.text === 'string'
        ? responsePayload.text
        : JSON.stringify(responsePayload.text ?? responsePayload);

      let result: any = {};
      try {
        result = JSON.parse(text || '{}');
      } catch (parseError) {
        console.warn('Security analyze response parse failed:', parseError, text);
        result = { isSafe: false, score: 0, threatType: 'none', summary: 'Analysis response was not valid JSON.', points: ['Response parse failed.'], steganographyReport: 'N/A' };
      }

      let threatType = result.threatType || 'none';
      if (result.isSafe === true) {
        threatType = 'none';
        result.score = this.normalizeScore(result, content);
      }

      const finalResult: SecurityAnalysis = {
        isSafe: result.isSafe ?? false,
        score: this.normalizeScore(result, content),
        threatType: threatType,
        summary: result.summary || "No summary provided.",
        points: result.points || ["No detailed points available."],
        steganographyReport: result.steganographyReport || "No steganography report available.",
        isAnalyzed: true
      };

      this.analysisCache.set(contentHash, finalResult);
      return finalResult;
    } catch (error) {
      console.error("Security analysis failed:", error);
      return ANALYSIS_UNAVAILABLE;
    }
  }

  static async analyzeCall(transcript: string): Promise<SecurityAnalysis> {
    try {
      const res = await authenticatedFetch("/api/analyze-call", {
        method: "POST",
        body: JSON.stringify({ transcript })
      });

      if (!res.ok) {
        return ANALYSIS_UNAVAILABLE;
      }

      const { text } = await res.json();
      const result = JSON.parse(text || '{}');
      return {
        isSafe: result.isSafe ?? false,
        score: result.isSafe ? 100 : 0,
        threatType: result.threatType || 'none',
        summary: result.summary || "No summary provided.",
        points: result.points || ["No detailed analysis available."],
        steganographyReport: "N/A for voice calls.",
        isAnalyzed: true
      };
    } catch (error) {
      console.error("Call analysis failed:", error);
      return ANALYSIS_UNAVAILABLE;
    }
  }

  static async analyzeGroup(groupName: string, participantCount: number, creatorInfo: string): Promise<GroupVerification> {
    try {
      const res = await authenticatedFetch("/api/analyze-group", {
        method: "POST",
        body: JSON.stringify({ groupName, participantCount, creatorInfo })
      });

      if (!res.ok) {
        return GROUP_VERIFICATION_UNAVAILABLE;
      }

      const { text } = await res.json();
      const result = JSON.parse(text || '{}');
      return {
        isVerified: result.isVerified ?? false,
        status: result.status || 'unverified',
        reason: result.reason || "No reason provided.",
        threatMarkers: result.threatMarkers || [],
        timestamp: Date.now()
      };
    } catch (error) {
      console.error("Group analysis failed:", error);
      return GROUP_VERIFICATION_UNAVAILABLE;
    }
  }
}
