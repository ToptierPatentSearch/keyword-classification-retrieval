import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

type UserActivityRow = {
  user_id: string;
  email: string | null;
  signed_up_at_japan: string | null;
  confirmed_at_japan: string | null;
  latest_sign_in_at_japan: string | null;
  latest_sign_out_at_japan: string | null;
  login_count: number;
  logout_count: number;
  remaining_credits: number;
};

function show(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

export default function AdminUserActivity() {
  const [rows, setRows] = useState<UserActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadUserActivity() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("get_admin_user_activity");

    if (error) {
      setIsAllowed(false);
      setRows([]);

      if (
        error.message.toLowerCase().includes("not allowed") ||
        error.message.toLowerCase().includes("not authenticated")
      ) {
        setErrorMessage("");
      } else {
        setErrorMessage("User activity could not be loaded.");
      }

      setLoading(false);
      return;
    }

    setIsAllowed(true);
    setRows((data ?? []) as UserActivityRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadUserActivity();
  }, []);

  if (!isAllowed && !loading && !errorMessage) {
    return null;
  }

  return (
    <section className="admin-user-activity">
      <h2>Admin: User Activity</h2>

      <button type="button" onClick={loadUserActivity} disabled={loading}>
        {loading ? "Loading..." : "Refresh"}
      </button>

      {errorMessage && <p>{errorMessage}</p>}

      {isAllowed && rows.length === 0 && !loading && (
        <p>No user activity was found.</p>
      )}

      {isAllowed && rows.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>User ID</th>
                <th>Signed up</th>
                <th>Confirmed</th>
                <th>Latest sign-in</th>
                <th>Latest sign-out</th>
                <th>Logins</th>
                <th>Logouts</th>
                <th>Remaining credits</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.user_id}>
                  <td>{show(row.email)}</td>
                  <td>{show(row.user_id)}</td>
                  <td>{show(row.signed_up_at_japan)}</td>
                  <td>{show(row.confirmed_at_japan)}</td>
                  <td>{show(row.latest_sign_in_at_japan)}</td>
                  <td>{show(row.latest_sign_out_at_japan)}</td>
                  <td>{show(row.login_count)}</td>
                  <td>{show(row.logout_count)}</td>
                  <td>{show(row.remaining_credits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}