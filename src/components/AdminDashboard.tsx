import React, { useEffect, useState } from 'react';
import {
  Users, Shield, BarChart3, AlertTriangle, Ban, CheckCircle,
  X, Activity, MessageSquare, Phone, Eye
} from 'lucide-react';
import { AdminService } from '../services/adminService';
import { AuditLogService } from '../services/auditLogService';
import type { AdminUserRecord, ModerationAction, PlatformAnalytics, SecurityAuditLog } from '../types';
import { format } from 'date-fns';

interface AdminDashboardProps {
  adminId: string;
  theme: 'light' | 'dark' | 'glow';
  onClose: () => void;
}

export default function AdminDashboard({ adminId, theme, onClose }: AdminDashboardProps) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [moderationActions, setModerationActions] = useState<ModerationAction[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'analytics' | 'users' | 'moderation' | 'security'>('analytics');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [userList, stats] = await Promise.all([
        AdminService.getAllUsers(),
        AdminService.getPlatformAnalytics(),
      ]);
      setUsers(userList);
      setAnalytics(stats);
      setLoading(false);
    };
    load();
    const unsubs = [
      AdminService.subscribeToModerationActions(setModerationActions),
      AuditLogService.subscribeToAllLogs(setAuditLogs, 100),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const cardClass = theme === 'glow'
    ? 'bg-emerald-900/20 border-emerald-500/20 text-white'
    : theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`w-full max-w-5xl max-h-[90vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden ${cardClass}`}>
        <div className="p-6 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Admin Control Center</h2>
              <p className="text-xs opacity-60">Platform management & security monitoring</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 p-4 border-b shrink-0">
          {([
            { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
            { id: 'users' as const, label: 'Users', icon: Users },
            { id: 'moderation' as const, label: 'Moderation', icon: Ban },
            { id: 'security' as const, label: 'Security Monitor', icon: Eye },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === tab.id ? 'bg-indigo-600 text-white' : 'opacity-60 hover:opacity-100'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12 opacity-60">Loading platform data...</div>
          ) : activeTab === 'analytics' && analytics ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'Total Users', value: analytics.totalUsers, icon: Users, color: 'text-blue-500' },
                  { label: 'Active (24h)', value: analytics.activeUsers24h, icon: Activity, color: 'text-emerald-500' },
                  { label: 'Threats Detected', value: analytics.threatsDetected, icon: AlertTriangle, color: 'text-red-500' },
                  { label: 'Active Calls', value: analytics.activeCalls, icon: Phone, color: 'text-purple-500' },
                  { label: 'Active Meetings', value: analytics.activeMeetings, icon: MessageSquare, color: 'text-amber-500' },
                ].map((stat) => (
                  <div key={stat.label} className={`p-5 rounded-2xl border ${cardClass}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color} mb-2`} />
                    <p className="text-3xl font-bold">{stat.value}</p>
                    <p className="text-xs opacity-60">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === 'users' ? (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.uid} className={`p-4 rounded-2xl border flex items-center justify-between ${cardClass}`}>
                  <div>
                    <p className="font-bold text-sm">{u.displayName}</p>
                    <p className="text-xs opacity-60">{u.email}</p>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded mt-1 inline-block ${
                      u.status === 'active' ? 'bg-emerald-500/20 text-emerald-500' :
                      u.status === 'suspended' ? 'bg-amber-500/20 text-amber-500' :
                      'bg-red-500/20 text-red-500'
                    }`}>{u.status}</span>
                  </div>
                  <div className="flex gap-2">
                    {u.status === 'active' ? (
                      <>
                        <button
                          onClick={() => AdminService.suspendUser(adminId, u.uid, 'Admin action')}
                          className="px-3 py-1.5 bg-amber-500/20 text-amber-600 rounded-lg text-xs font-bold"
                        >
                          Suspend
                        </button>
                        <button
                          onClick={() => AdminService.banUser(adminId, u.uid, 'Admin action')}
                          className="px-3 py-1.5 bg-red-500/20 text-red-500 rounded-lg text-xs font-bold"
                        >
                          Ban
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => AdminService.reinstateUser(adminId, u.uid)}
                        className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" /> Reinstate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === 'moderation' ? (
            <div className="space-y-2">
              {moderationActions.length === 0 ? (
                <p className="text-sm opacity-60 text-center py-8">No moderation actions yet</p>
              ) : moderationActions.map((action) => (
                <div key={action.id} className={`p-4 rounded-2xl border ${cardClass}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Ban className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-bold uppercase">{action.action}</span>
                    <span className="text-xs opacity-40">
                      {action.timestamp ? format(action.timestamp.toDate(), 'PPp') : ''}
                    </span>
                  </div>
                  <p className="text-sm">{action.reason}</p>
                  <p className="text-xs opacity-40">Target: {action.targetUserId}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {auditLogs.filter((l) => l.severity !== 'info').map((log) => (
                <div key={log.id} className={`p-3 rounded-xl border flex items-start gap-3 ${cardClass}`}>
                  <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                    log.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium">{log.description}</p>
                    <p className="text-xs opacity-40">
                      {log.userId} · {log.eventType} · {log.timestamp ? format(log.timestamp.toDate(), 'PPp') : ''}
                    </p>
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
