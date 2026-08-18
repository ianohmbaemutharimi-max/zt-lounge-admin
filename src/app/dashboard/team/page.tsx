"use client";

import { useState, useEffect } from "react";
import { Button, Card, PageHeader } from "@/components/ui";
import { Clock, CheckCircle, XCircle } from "lucide-react";
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

export default function TeamPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    fetchInvitations();
  }, []);

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
                        Role: {inv.roles?.name} • Invited: {formatDate(inv.created_at)}
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
