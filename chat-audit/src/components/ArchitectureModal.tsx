import React from 'react';
import { Database, Lock, Server, ShieldCheck } from 'lucide-react';

export const ArchitectureModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            System Architecture, Database Schema & Endpoints
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Complete full-stack overview of Firestore collections, zero-trust security rules, and real-time WebSocket/REST endpoints.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Back to Chat Rooms
        </button>
      </div>

      {/* Database Schema Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-3">
            <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>1. Cloud Firestore Database Schema</span>
          </div>
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="font-mono-tabular font-semibold text-blue-600 dark:text-blue-400">
                /ticker_slots/&#123;slot_1 .. slot_7&#125;
              </div>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Fields: <code className="font-mono-tabular">slotIndex (1-7)</code>, <code className="font-mono-tabular">text (1-180 chars)</code>, <code className="font-mono-tabular">publisherUid</code>, <code className="font-mono-tabular">publisherUsername</code>, <code className="font-mono-tabular">publisherRole (vip|moderator|admin)</code>, <code className="font-mono-tabular">category</code>, <code className="font-mono-tabular">updatedAt</code>.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="font-mono-tabular font-semibold text-blue-600 dark:text-blue-400">
                /rooms/&#123;roomId&#125; &amp; /rooms/&#123;roomId&#125;/messages/&#123;messageId&#125;
              </div>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Public text chat rooms and subcollection messages guarded by Master Gate relational existence check (<code className="font-mono-tabular">exists(/rooms/$(roomId))</code>).
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="font-mono-tabular font-semibold text-blue-600 dark:text-blue-400">
                /bubble_messages/&#123;messageId&#125;
              </div>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Floating chat bubble stream supporting channels (<code className="font-mono-tabular">pulse</code>, <code className="font-mono-tabular">lounge</code>, <code className="font-mono-tabular">help</code>) with real-time snapshot listeners.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="font-mono-tabular font-semibold text-blue-600 dark:text-blue-400">
                /users/&#123;userId&#125; &amp; /users_private/&#123;userId&#125;
              </div>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Split-collection PII isolation: public profiles contain display handle, role, and presence; private emails are strictly locked inside <code className="font-mono-tabular">/users_private/&#123;userId&#125;</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Backend Endpoints & Real-Time WebSockets */}
        <div className="space-y-5">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-3">
              <Server className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>2. Backend REST &amp; WebSocket Endpoints (Port 3000)</span>
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-start justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400">
                  WS /ws
                </span>
                <span className="text-slate-600 dark:text-slate-400 text-right">
                  Server-authoritative online member list, active room presence, and WebRTC ICE/SDP mesh signaling.
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="font-mono-tabular font-semibold text-blue-600 dark:text-blue-400">
                  GET /api/voice-rooms
                </span>
                <span className="text-slate-600 dark:text-slate-400 text-right">
                  Returns live voice lounges and connected speaker states.
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="font-mono-tabular font-semibold text-blue-600 dark:text-blue-400">
                  GET /api/architecture
                </span>
                <span className="text-slate-600 dark:text-slate-400 text-right">
                  JSON specification of collections, access control, and API routes.
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="font-mono-tabular font-semibold text-blue-600 dark:text-blue-400">
                  GET /api/health
                </span>
                <span className="text-slate-600 dark:text-slate-400 text-right">
                  Active connection telemetry and server uptime check.
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>3. Zero-Trust RBAC &amp; Validation Synchronicity</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Every write operation is validated both client-side (<code className="font-mono-tabular">BLUEPRINT_CONSTRAINTS</code>) and server-side in <code className="font-mono-tabular">firestore.rules</code> with strict key allowlists (<code className="font-mono-tabular">hasOnly</code>), <code className="font-mono-tabular">request.time</code> temporal verification, and role-based ticker publishing gates.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5" />
              <span>Audited with @firebase/eslint-plugin-security-rules</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
