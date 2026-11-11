// ==========================================
// SERVER MEMBER LIST
// ==========================================

async function loadServerMembers(serverId) {
  const list = $("serverMembersList");
  list.innerHTML = "";

  const heading = document.createElement("div");
  heading.className = "member-group-title";
  heading.textContent = "SERVER MEMBERS";
  list.appendChild(heading);

  const { data: memberships, error } = await db
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId);

  if (error) {
    notify("Could not load members: " + error.message);
    return;
  }

  if (!memberships || memberships.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No members found.";
    list.appendChild(empty);
    return;
  }

  const count = document.createElement("div");
  count.className = "member-group-title";
  count.textContent = "ALL MEMBERS — " + memberships.length;
  list.appendChild(count);

  for (const membership of memberships) {
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("username")
      .eq("id", membership.user_id)
      .maybeSingle();

    if (profileError || !profile) continue;

    const row = document.createElement("div");
    row.className = "member-row";

    const avatarWrap = document.createElement("div");
    avatarWrap.className = "member-avatar-wrap";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = profile.username.charAt(0).toUpperCase();

    avatarWrap.appendChild(avatar);

    const name = document.createElement("span");
    name.textContent = profile.username;

    row.append(avatarWrap, name);
    list.appendChild(row);
  }
}
