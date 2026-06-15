import React, { useEffect, useState } from 'react';
import {
  Shield, ShieldAlert, ShieldCheck, Activity, Key, Smartphone,
  AlertTriangle, Eye, X, RefreshCw, FileWarning, Link2
} from 'lucide-react';
import { AuditLogService } from '../services/auditLogService';
import { DeviceService } from '../services/deviceService';
import { SessionService } from '../services/sessionService';
import { KeyManagementService } from '../services/keyManagementService';
import type { SecurityAuditLog, LinkedDevice, UserSession } from '../types';
import { format } from 'date-fns';

interface SecurityDashboardProps {
  userId: string;
  userEmail: string;
  theme: 'light' | 'dark' | 'glow';
  onClose: () => void;
}

export default function SecurityDashboard({ userId, userEmail, theme, onClose }: SecurityDashboardProps) {
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([]);
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [keyFingerprint, setKeyFingerprint] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'sessions' | 'audit'>('overview');

  useEffect(() => {
    const unsubs = [
      AuditLogService.subscribeToUserLogs(userId, setAuditLogs),
      DeviceService.subscribeToUserDevices(userId, setDevices),
      SessionService.subscribeToUserSessions(userId, setSessions),
    ];
    KeyManagementService.getOrCreateKeys(userId).then((k) => setKeyFingerprint(k.metadata.fingerprint));
    return () => unsubs.forEach((u) => u());
  }, [userId]);

  const criticalEvents = auditLogs.filter((l) => l.severity === 'critical' || l.severity === 'warning');
  const verifiedDevices = devices.filter((d) => d.verified).length;

  const cardClass = theme === 'glow'
    ? 'bg-emerald-900/20 border-emerald-500/20 text-white'
    : theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`w-full max-w-4xl max-h-[90vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden ${cardClass}`}>
        <div className="p-6 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Security Dashboard</h2>
              <p className="text-xs opacity-60">{userEmail}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 p-4 border-b shrink-0">
          {(['overview', 'devices', 'sessions', 'audit'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === tab ? 'bg-emerald-500 text-white' : 'opacity-60 hover:opacity-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Devices', value: devices.length, icon: Smartphone, color: 'text-blue-500' },
                  { label: 'Verified', value: verifiedDevices, icon: ShieldCheck, color: 'text-emerald-500' },
                  { label: 'Sessions', value: sessions.length, icon: Activity, color: 'text-purple-500' },
                  { label: 'Alerts', value: criticalEvents.length, icon: AlertTriangle, color: 'text-red-500' },
                ].map((stat) => (
                  <div key={stat.label} className={`p-4 rounded-2xl border ${cardClass}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color} mb-2`} />
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs opacity-60">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className={`p-6 rounded-2xl border ${cardClass}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Key className="w-5 h-5 text-emerald-500" />
                  <h3 className="font-bold">Encryption Key Fingerprint</h3>
                </div>
                <code className="text-sm font-mono bg-black/20 px-4 py-2 rounded-xl block">{keyFingerprint || 'Loading...'}</code>
                <p className="text-xs opacity-60 mt-2">Share this with contacts to verify your identity</p>
                <button
                  onClick={async () => {
                    const result = await KeyManagementService.rotateKeys(userId);
                    setKeyFingerprint(result.fingerprint);
                  }}
                  className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-2"
                >
                  <RefreshCw className="w-3 h-3" /> Rotate Keys
                </button>
              </div>

              <div className={`p-6 rounded-2xl border ${cardClass}`}>
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <FileWarning className="w-5 h-5 text-red-500" /> Recent Security Events
                </h3>
                {criticalEvents.length === 0 ? (
                  <p className="text-sm opacity-60 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-500" /> No security alerts</p>
                ) : (
                  <div className="space-y-2">
                    {criticalEvents.slice(0, 5).map((log) => (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10">
                        <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{log.description}</p>
                          <p className="text-xs opacity-50">{log.timestamp ? format(log.timestamp.toDate(), 'PPp') : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'devices' && (
            <div className="space-y-3">
              {devices.length === 0 ? (
                <p className="text-sm opacity-60 text-center py-8">No linked devices</p>
              ) : devices.map((device) => (
                <div key={device.id} className={`p-4 rounded-2xl border flex items-center justify-between ${cardClass}`}>
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-emerald-500" />
                    <div>
                      <p className="font-bold text-sm">{device.name}</p>
                      <p className="text-xs opacity-60">{device.platform} · {device.browser}</p>
                      <p className="text-xs opacity-40">
                        {device.verified ? '✓ Verified' : 'Unverified'} ·
                        {device.isActive ? ' Active' : ' Inactive'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!device.verified && (
                      <button
                        onClick={() => DeviceService.verifyDevice(userId, device.id)}
                        className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold"
                      >
                        Verify
                      </button>
                    )}
                    <button
                      onClick={() => DeviceService.revokeDevice(userId, device.id)}
                      className="px-3 py-1.5 bg-red-500/20 text-red-500 rounded-lg text-xs font-bold"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="space-y-3">
              <button
                onClick={() => SessionService.revokeAllSessions(userId, DeviceService.getCurrentDeviceId() ?? undefined)}
                className="w-full py-2 bg-red-500 text-white rounded-xl text-xs font-bold mb-4"
              >
                Revoke All Other Sessions
              </button>
              {sessions.map((session) => (
                <div key={session.id} className={`p-4 rounded-2xl border flex items-center justify-between ${cardClass}`}>
                  <div>
                    <p className="font-bold text-sm">Session {session.id.slice(0, 8)}...</p>
                    <p className="text-xs opacity-60">Device: {session.deviceId?.slice(0, 8)}...</p>
                    <p className="text-xs opacity-40">
                      {session.lastActivity ? format(session.lastActivity.toDate(), 'PPp') : 'Unknown'}
                    </p>
                  </div>
                  <button
                    onClick={() => SessionService.revokeSession(userId, session.id)}
                    className="px-3 py-1.5 bg-red-500/20 text-red-500 rounded-lg text-xs font-bold"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-2">
              {auditLogs.length === 0 ? (
                <p className="text-sm opacity-60 text-center py-8">No audit logs yet</p>
              ) : auditLogs.map((log) => (
                <div key={log.id} className={`p-3 rounded-xl border flex items-start gap-3 ${cardClass}`}>
                  <Eye className="w-4 h-4 opacity-40 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        log.severity === 'critical' ? 'bg-red-500/20 text-red-500' :
                        log.severity === 'warning' ? 'bg-amber-500/20 text-amber-500' :
                        'bg-emerald-500/20 text-emerald-500'
                      }`}>{log.severity}</span>
                      <span className="text-[10px] opacity-40 uppercase">{log.eventType}</span>
                    </div>
                    <p className="text-sm mt-1">{log.description}</p>
                    <p className="text-xs opacity-40">{log.timestamp ? format(log.timestamp.toDate(), 'PPp') : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
