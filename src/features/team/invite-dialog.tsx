"use client";

import { useState, useEffect } from "react";
import { Button, Input, Select, Field } from "@/components/ui";
import { X } from "lucide-react";

interface InviteDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function InviteTeamMemberDialog({ onClose, onSuccess }: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);

  // Load available roles on mount
  useEffect(() => {
    const loadRoles = async () => {
      try {
        const response = await fetch("/api/admin/roles");
        if (response.ok) {
          const data = await response.json();
          setRoles(data.data || []);
        }
      } catch (err) {
        console.error("Failed to load roles:", err);
      }
    };
    loadRoles();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !roleId) {
      setError("Please fill in all fields");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/admin/team-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, roleId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send invitation");
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to send invitation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-panel border border-edge rounded-2xl shadow-2xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-edge">
          <h2 className="text-lg font-semibold text-stone-100">Invite Team Member</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-panel-2 rounded transition"
          >
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-600/15 border border-rose-600/30 rounded-lg text-rose-400 text-sm">
              {error}
            </div>
          )}

          <Field label="Email Address">
            <Input
              type="email"
              placeholder="team@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </Field>

          <Field label="Role">
            <Select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={loading}
            >
              <option value="">Select a role...</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gold"
              disabled={loading}
              className="flex-1"
            >
              {loading ? "Sending..." : "Send Invitation"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
