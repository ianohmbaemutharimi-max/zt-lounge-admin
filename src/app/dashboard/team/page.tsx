"use client";

import { useState, useEffect } from "react";
import { Button, Card, PageHeader, Toggle, Modal, Toaster } from "@/components/ui";
import { Clock, CheckCircle, XCircle, User, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { InviteTeamMemberDialog } from "@/features/team/invite-dialog";

interface Invitation {
  id: string;
  email: string;
  role_id: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
  roles?: { name: string };
}

interface TeamMember {
  profile_id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  role_name: "super_admin" | "admin";
  is_active: boolean;
  last_sign_in_at: string | null;
  joined_at: string;
}

export default function TeamPage() {
  const { profile } = useAuth();
  const { toasts, toast, dismiss } = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    fetchInvitations();
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    try {
      const res = await fetch("/api/admin/team-directory");
      if (!res.ok) throw new Error("Failed to fetch team");
      const data = await res.json();
      setTeam(data.team || []);
    } catch (err) {
      console.error("Error fetching team:", err);
    }
  };

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/team-invitations?status=pending");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setInvitations(data.data || []);
    } catch (err) {
      console.error("Error fetching invitations:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/team-invitations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to revoke");
      await fetchInvitations();
    } catch (err) {
      console.error("Error revoking:", err);
    }
  };

  const handleResend = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/team-invitations/${id}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to resend");
      await fetchInvitations();
    } catch (err) {
      console.error("Error resending:", err);
    }
  };

  const handleToggleStatus = async (member: TeamMember) => {
    setTogglingId(member.profile_id);
    try {
      const res = await fetch(`/api/admin/profiles/${member.profile_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !member.is_active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update status");
      }
      toast({ title: `Member ${!member.is_active ? "activated" : "deactivated"}`, status: "success" });
      await fetchTeam();
    } catch (err: any) {
      toast({ title: err?.message || "Failed to update status", status: "error" });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/profiles/${pendingDelete.profile_id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete member");
      }
      toast({ title: "Team member removed", status: "success" });
      setPendingDelete(null);
      await fetchTeam();
    } catch (err: any) {
      toast({ title: err?.message || "Failed to delete member", status: "error" });
    } finally {
      setDeleting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case "accepted":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "revoked":
      case "expired":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div>
      <PageHeader
        title="Team Management"
        subtitle="Invite and manage team members"
        actions={
          <Button variant="gold" onClick={() => setShowInvite(true)}>
            Invite Team Member
          </Button>
        }
      />

      {showInvite && (
        <InviteTeamMemberDialog
          onClose={() => setShowInvite(false)}
          onSuccess={() => {
            setShowInvite(false);
            fetchInvitations();
          }}
        />
      )}

      {pendingDelete && (
        <Modal open onClose={() => setPendingDelete(null)} title="Remove team member?">
          <p className="text-sm text-stone-300 mb-4">
            {pendingDelete.full_name || pendingDelete.email} will lose access. History is preserved.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Removing..." : "Remove"}
            </Button>
          </div>
        </Modal>
      )}

      <Toaster toasts={toasts} />

      {team.length > 0 && (
        <Card className="mb-6">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-sm font-medium text-stone-300">Team members</h2>
            <span className="text-xs text-stone-500">
              {team.filter((m) => m.is_active).length} active · {team.length} total
            </span>
          </div>
          <div className="divide-y divide-edge">
            {team.map((member) => {
              const isSelf = profile?.id === member.profile_id;
              return (
                <div
                  key={member.profile_id}
                  className="p-4 flex items-center justify-between hover:bg-panel-2"
                >
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-stone-400" />
                    <div>
                      <p className="text-stone-100 font-medium">
                        {member.full_name || member.email || "Unknown"}
                        {isSelf && <span className="text-xs text-stone-500 ml-2">(you)</span>}
                      </p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {member.email || "no email"} • Role: {member.role_name}
                        {member.is_active ? "" : " (inactive)"}
                        {member.last_sign_in_at &&
                          ` • Last sign-in: ${formatDate(member.last_sign_in_at)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Toggle
                      checked={member.is_active}
                      onChange={() => handleToggleStatus(member)}
                      disabled={isSelf || togglingId === member.profile_id}
                    />
                    <Button
                      variant="danger"
                      onClick={() => setPendingDelete(member)}
                      disabled={isSelf}
                      aria-label="Remove member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {loading ? (
        <Card className="p-8 text-center text-stone-400">Loading...</Card>
      ) : invitations.length === 0 ? (
        <Card className="p-8 text-center text-stone-400">
          No pending invitations
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-edge">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="p-4 flex items-center justify-between hover:bg-panel-2"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(inv.status)}
                    <div>
                      <p className="text-stone-100 font-medium">{inv.email}</p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        Role: {inv.roles?.name || 'Unknown'} • Invited: {formatDate(inv.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
                {inv.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => handleResend(inv.id)}
                    >
                      Resend
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleRevoke(inv.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
