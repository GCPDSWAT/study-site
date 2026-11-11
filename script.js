
/* ==========================================
   VEXCHAT - COMPLETE FRONTEND
   Supabase + GitHub Pages
   Existing accounts and DMs preserved
========================================== */

// YOUR EXISTING SUPABASE CONNECTION
const SUPABASE_URL = "https://sprhwvrzpltridhikttp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JTH82eb7Tk7s4MEXCQPPGA_6Cn70nKy";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let currentChat = null;
let messageSubscription = null;
let friends = [];
let servers = [];
let selectedServer = null;
let selectedChannel = null;
let searchTimer = null;

// ==========================================
// NOTIFICATIONS
// ==========================================

function notify(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.style.display = "block";

  setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

function showError(message) {
  $("authError").textContent = message;
}

// ==========================================
// MODALS
// ==========================================

function openModal(id) {
  $(id)?.classList.remove("hidden");
}

function closeModal(id) {
  $(id)?.classList.add("hidden");
}

document.querySelectorAll(".modal-close").forEach(button => {
  button.addEventListener("click", () => {
    closeModal(button.dataset.close);
  });
});

document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", event => {
    if (event.target === modal) {
      modal.classList.add("hidden");
    }
  });
});

// ==========================================
// NAVIGATION
// ==========================================

function showApp() {
  $("authScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
}

function showAuth() {
  $("app").classList.add("hidden");
  $("authScreen").classList.remove("hidden");
}

function showDirectMessages() {
  $("serverPanel").classList.add("hidden");
  $("directMessagePanel").classList.remove("hidden");
}

function showServerPanel() {
  $("directMessagePanel").classList.add("hidden");
  $("serverPanel").classList.remove("hidden");
}

function switchView(view) {
  $("welcome").classList.add("hidden");
  $("messages").classList.add("hidden");
  $("messageForm").classList.add("hidden");
  $("settingsView").classList.add("hidden");

  showDirectMessages();

  document.querySelectorAll(".server-icon[data-view]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === view
    );
  });

  if (view === "home") {
    $("welcome").classList.remove("hidden");
    $("chatTitle").textContent = "Welcome to VEXCHAT";
    $("chatSubtitle").textContent = "Choose a friend or server.";
    currentChat = null;
  }

  if (view === "messages") {
    $("chatTitle").textContent = "Messages";
    $("chatSubtitle").textContent = "Choose a friend to start chatting.";

    if (currentChat) {
      $("messages").classList.remove("hidden");
      $("messageForm").classList.remove("hidden");
    } else {
      $("welcome").classList.remove("hidden");
    }
  }

  if (view === "settings") {
    $("settingsView").classList.remove("hidden");

    $("settingsUsername").textContent =
      currentProfile?.username || "User";

    $("settingsEmail").textContent =
      currentUser?.email || "Not available";

    $("chatTitle").textContent = "Settings";
    $("chatSubtitle").textContent = "Manage your account.";
  }
}

// ==========================================
// SIGN UP
// ==========================================

async function signup() {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  const username = $("authUsername").value.trim();

  showError("");

  if (!email || !password || !username) {
    showError("Fill in all three fields.");
    return;
  }

  if (password.length < 6) {
    showError("Password must be at least 6 characters.");
    return;
  }

  try {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });

    if (error) {
      showError(error.message);
      return;
    }

    if (data.session) {
      await loadApp();
    } else {
      showError(
        "Account created! Check your email if confirmation is required."
      );
    }

  } catch (error) {
    showError(error.message);
  }
}

// ==========================================
// LOG IN
// ==========================================

async function login() {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;

  showError("");

  if (!email || !password) {
    showError("Enter your email and password.");
    return;
  }

  try {
    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showError(error.message);
      return;
    }

    await loadApp();

  } catch (error) {
    showError(error.message);
  }
}

// ==========================================
// LOG OUT
// ==========================================

async function logout() {
  if (messageSubscription) {
    await db.removeChannel(messageSubscription);
    messageSubscription = null;
  }

  const { error } = await db.auth.signOut();

  if (error) {
    notify(error.message);
    return;
  }

  currentUser = null;
  currentProfile = null;
  currentChat = null;
  friends = [];
  servers = [];
  selectedServer = null;
  selectedChannel = null;

  $("friendsList").innerHTML = "";
  $("requestsList").innerHTML = "";
  $("serverList").innerHTML = "";

  showAuth();
}

// ==========================================
// LOAD APPLICATION
// ==========================================

async function loadApp() {
  try {
    const { data, error: authError } = await db.auth.getUser();

    if (authError || !data.user) {
      showAuth();
      return;
    }

    currentUser = data.user;

    const username =
      currentUser.user_metadata.username ||
      currentUser.email.split("@")[0];

    const { error: upsertError } = await db
      .from("profiles")
      .upsert({
        id: currentUser.id,
        username,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "id"
      });

    if (upsertError) {
      notify("Profile error: " + upsertError.message);
      return;
    }

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();

    if (profileError || !profile) {
      notify("Could not load your profile.");
      return;
    }

    currentProfile = profile;

    $("myUsername").textContent = profile.username;
    $("myAvatar").textContent = profile.username[0].toUpperCase();

    $("settingsUsername").textContent = profile.username;
    $("settingsEmail").textContent = currentUser.email;

    showApp();
    switchView("home");

    await loadFriends();
    await loadRequests();
    await loadServers();

  } catch (error) {
    notify("Loading error: " + error.message);
  }
}

// ==========================================
// LOAD FRIENDS
// ==========================================

async function loadFriends() {
  const { data, error } = await db
    .from("friendships")
    .select("*")
    .or(
      `user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`
    )
    .eq("status", "accepted");

  if (error) {
    notify("Friends error: " + error.message);
    return;
  }

  friends = [];

  for (const relation of data || []) {
    const otherId =
      relation.user_id === currentUser.id
        ? relation.friend_id
        : relation.user_id;

    const { data: profile } = await db
      .from("profiles")
      .select("*")
      .eq("id", otherId)
      .maybeSingle();

    if (profile) friends.push(profile);
  }

  renderFriends();
}

function renderFriends() {
  const list = $("friendsList");
  list.innerHTML = "";

  if (!friends.length) {
    list.innerHTML =
      '<p class="muted">No friends yet. Add someone to start chatting!</p>';
    return;
  }

  friends.forEach(friend => {
    const item = document.createElement("div");
    item.className = "friend";

    if (currentChat?.id === friend.id) {
      item.classList.add("selected");
    }

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = friend.username[0].toUpperCase();

    const name = document.createElement("span");
    name.textContent = friend.username;

    item.append(avatar, name);
    item.onclick = () => openChat(friend);

    list.appendChild(item);
  });
}

// ==========================================
// ADD FRIEND
// ==========================================

async function addFriend(usernameFromSearch = null) {
  const username = usernameFromSearch ||
    prompt("Enter your friend's username:");

  if (!username || !username.trim()) return;

  const { data: profile, error } = await db
    .from("profiles")
    .select("id,username")
    .ilike("username", username.trim())
    .maybeSingle();

  if (error || !profile) {
    notify("User not found.");
    return;
  }

  if (profile.id === currentUser.id) {
    notify("You cannot add yourself.");
    return;
  }

  const { data: existing, error: existingError } = await db
    .from("friendships")
    .select("id")
    .or(
      `and(user_id.eq.${currentUser.id},friend_id.eq.${profile.id}),and(user_id.eq.${profile.id},friend_id.eq.${currentUser.id})`
    )
    .maybeSingle();

  if (existingError) {
    notify(existingError.message);
    return;
  }

  if (existing) {
    notify("A friendship or request already exists.");
    return;
  }

  const { error: insertError } = await db
    .from("friendships")
    .insert({
      user_id: currentUser.id,
      friend_id: profile.id,
      status: "pending"
    });

  if (insertError) {
    notify(insertError.message);
  } else {
    notify("Friend request sent!");
    $("userSearchResults").innerHTML = "";
    $("userSearch").value = "";
  }
}

// ==========================================
// SEARCH USERS
// ==========================================

async function searchUsers(query) {
  const results = $("userSearchResults");

  if (!query || !currentUser) {
    results.innerHTML = "";
    return;
  }

  const { data, error } = await db
    .from("profiles")
    .select("id,username")
    .ilike("username", `%${query}%`)
    .neq("id", currentUser.id)
    .limit(6);

  results.innerHTML = "";

  if (error) return;

  if (!data || !data.length) {
    results.innerHTML =
      '<div class="search-result">No users found.</div>';
    return;
  }

  data.forEach(user => {
    const result = document.createElement("div");
    result.className = "search-result";
    result.textContent = user.username;
    result.onclick = () => addFriend(user.username);
    results.appendChild(result);
  });
}

// ==========================================
// FRIEND REQUESTS
// ==========================================

async function loadRequests() {
  const { data, error } = await db
    .from("friendships")
    .select("*")
    .eq("friend_id", currentUser.id)
    .eq("status", "pending");

  const list = $("requestsList");
  list.innerHTML = "";

  if (error) {
    notify("Request error: " + error.message);
    return;
  }

  for (const request of data || []) {
    const { data: profile } = await db
      .from("profiles")
      .select("*")
      .eq("id", request.user_id)
      .maybeSingle();

    if (!profile) continue;

    const row = document.createElement("div");
    row.className = "friend";

    const name = document.createElement("span");
    name.textContent = profile.username;

    const accept = document.createElement("button");
    accept.textContent = "✓";
    accept.title = "Accept friend request";
    accept.onclick = () => acceptRequest(request.id);

    row.append(name, accept);
    list.appendChild(row);
  }
}

async function acceptRequest(id) {
  const { error } = await db
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", id)
    .eq("friend_id", currentUser.id);

  if (error) {
    notify(error.message);
    return;
  }

  notify("Friend added!");

  await loadFriends();
  await loadRequests();
}

// ==========================================
// DIRECT MESSAGES
// ==========================================

async function openChat(friend) {
  currentChat = friend;
  selectedServer = null;
  selectedChannel = null;

  showDirectMessages();

  $("welcome").classList.add("hidden");
  $("settingsView").classList.add("hidden");
  $("messages").classList.remove("hidden");
  $("messageForm").classList.remove("hidden");

  $("chatTitle").textContent = friend.username;
  $("chatSubtitle").textContent = "Direct messages";

  document.querySelectorAll(".server-icon[data-view]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === "messages"
    );
  });

  renderFriends();

  if (messageSubscription) {
    await db.removeChannel(messageSubscription);
    messageSubscription = null;
  }

  await loadMessages();

  messageSubscription = db
    .channel("chat-" + currentUser.id + "-" + friend.id)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages"
      },
      payload => {
        const message = payload.new;

        const belongsToChat =
          (message.sender_id === currentUser.id &&
           message.receiver_id === friend.id) ||
          (message.sender_id === friend.id &&
           message.receiver_id === currentUser.id);

        if (belongsToChat) addMessage(message);
      }
    )
    .subscribe();
}

async function loadMessages() {
  if (!currentChat) return;

  const { data, error } = await db
    .from("messages")
    .select("*")
    .or(
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChat.id}),and(sender_id.eq.${currentChat.id},receiver_id.eq.${currentUser.id})`
    )
    .order("created_at", { ascending: true });

  if (error) {
    notify("Message error: " + error.message);
    return;
  }

  $("messages").innerHTML = "";
  (data || []).forEach(addMessage);
}

function addMessage(message) {
  const container = $("messages");

  const existing = Array.from(
    container.querySelectorAll(".message")
  ).some(element =>
    element.dataset.messageId === String(message.id)
  );

  if (existing) return;

  const wrapper = document.createElement("div");

  wrapper.className =
    "message" +
    (message.sender_id === currentUser.id ? " mine" : "");

  wrapper.dataset.messageId = message.id;

  const avatar = document.createElement("div");
  avatar.className = "avatar";

  avatar.textContent =
    message.sender_id === currentUser.id
      ? currentProfile.username[0].toUpperCase()
      : currentChat.username[0].toUpperCase();

  const content = document.createElement("div");
  content.className = "message-content";

  const sender = document.createElement("small");
  sender.textContent =
    message.sender_id === currentUser.id
      ? "You"
      : currentChat.username;

  const text = document.createElement("p");
  text.textContent = message.content;

  content.append(sender, text);
  wrapper.append(avatar, content);

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

async function sendMessage(event) {
  event.preventDefault();

  if (!currentChat) {
    notify("Choose a friend first.");
    return;
  }

  const input = $("messageInput");
  const content = input.value.trim();

  if (!content) return;

  input.value = "";

  const { error } = await db
    .from("messages")
    .insert({
      sender_id: currentUser.id,
      receiver_id: currentChat.id,
      content
    });

  if (error) {
    notify("Could not send message: " + error.message);
    input.value = content;
  }
}

// ==========================================
// SERVER SYSTEM
// ==========================================

// Load servers that the logged-in user belongs to

async function loadServers() {
  const { data: memberships, error } = await db
    .from("server_members")
    .select("server_id,role")
    .eq("user_id", currentUser.id);

  if (error) {
    notify("Server loading error: " + error.message);
    return;
  }

  servers = [];

  for (const membership of memberships || []) {
    const { data: server, error: serverError } = await db
      .from("servers")
      .select("*")
      .eq("id", membership.server_id)
      .maybeSingle();

    if (!serverError && server) {
      servers.push({
        ...server,
        myRole: membership.role
      });
    }
  }

  renderServers();
}

// Display server icons

function renderServers() {
  const list = $("serverList");
  list.innerHTML = "";

  servers.forEach(server => {
    const button = document.createElement("button");

    button.className = "server-icon";
    button.title = server.name;
    button.textContent = server.name[0].toUpperCase();

    if (selectedServer?.id === server.id) {
      button.classList.add("active");
    }

    button.onclick = () => openServer(server);

    list.appendChild(button);
  });
}

// Create server

async function createServer() {
  const name = $("newServerName").value.trim();

  if (!name) {
    notify("Enter a server name.");
    return;
  }

  if (name.length > 50) {
    notify("Server names must be 50 characters or fewer.");
    return;
  }

  const { data: server, error } = await db
    .from("servers")
    .insert({
      name,
      owner_id: currentUser.id
    })
    .select()
    .single();

  if (error) {
    notify("Could not create server: " + error.message);
    return;
  }

  // Add the creator as the server owner

  const { error: memberError } = await db
    .from("server_members")
    .insert({
      server_id: server.id,
      user_id: currentUser.id,
      role: "owner"
    });

  if (memberError) {
    notify("Server created, but owner setup failed: " + memberError.message);
    return;
  }

  // Create a default general channel

  const { error: channelError } = await db
    .from("server_channels")
    .insert({
      server_id: server.id,
      name: "general",
      description: "General conversations",
      created_by: currentUser.id
    });

  if (channelError) {
    notify("Server created, but default channel failed: " + channelError.message);
  } else {
    notify("Server created!");
  }

  $("newServerName").value = "";
  closeModal("createServerModal");

  await loadServers();

  const createdServer = servers.find(item => item.id === server.id);

  if (createdServer) {
    await openServer(createdServer);
  }
}

// Open server

async function openServer(server) {
  selectedServer = server;
  selectedChannel = null;
  currentChat = null;

  if (messageSubscription) {
    await db.removeChannel(messageSubscription);
    messageSubscription = null;
  }

  showServerPanel();

  $("selectedServerName").textContent = server.name;

  $("welcome").classList.remove("hidden");
  $("messages").classList.add("hidden");
  $("messageForm").classList.add("hidden");
  $("settingsView").classList.add("hidden");

  $("chatTitle").textContent = server.name;
  $("chatSubtitle").textContent = "Choose a channel to get started.";

  renderServers();

  await loadChannels();
  await loadServerMembers();
}

// Load channels

async function loadChannels() {
  if (!selectedServer) return;

  const { data, error } = await db
    .from("server_channels")
    .select("*")
    .eq("server_id", selectedServer.id)
    .order("created_at", { ascending: true });

  const list = $("channelList");
  list.innerHTML = "";

  if (error) {
    notify("Channel error: " + error.message);
    return;
  }

  if (!data || !data.length) {
    list.innerHTML = '<p class="muted">No channels yet.</p>';
    return;
  }

  data.forEach(channel => {
    const item = document.createElement("div");
    item.className = "channel";

    if (selectedChannel?.id === channel.id) {
      item.classList.add("active");
    }

    const icon = document.createElement("span");
    icon.className = "channel-icon";
    icon.textContent = "#";

    const name = document.createElement("span");
    name.textContent = channel.name;

    item.append(icon, name);
    item.onclick = () => openChannel(channel);

    list.appendChild(item);
  });
}

// Open a channel

function openChannel(channel) {
  selectedChannel = channel;

  $("welcome").classList.remove("hidden");
  $("messages").classList.add("hidden");
  $("messageForm").classList.add("hidden");

  $("chatTitle").textContent = "#" + channel.name;
  $("chatSubtitle").textContent =
    channel.description || selectedServer.name;

  $("welcome").querySelector("h1").textContent =
    "#" + channel.name;

  $("welcome").querySelector("p").textContent =
    "This channel is ready. Channel messaging will be connected in the next upgrade.";

  renderChannelSelection();
}

function renderChannelSelection() {
  document.querySelectorAll(".channel").forEach(item => {
    item.classList.remove("active");
  });

  const channels = $("channelList").children;

  Array.from(channels).forEach(item => {
    if (item.textContent.trim() === selectedChannel?.name) {
      item.classList.add("active");
    }
  });
}

// Create channel

async function createChannel() {
  if (!selectedServer) {
    notify("Choose a server first.");
    return;
  }

  const name = $("newChannelName").value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  const description = $("newChannelDescription").value.trim();

  if (!name) {
    notify("Enter a channel name.");
    return;
  }

  if (!/^[a-z0-9-]+$/.test(name)) {
    notify("Use letters, numbers, and hyphens only.");
    return;
  }

  const { error } = await db
    .from("server_channels")
    .insert({
      server_id: selectedServer.id,
      name,
      description,
      created_by: currentUser.id
    });

  if (error) {
    notify("Could not create channel: " + error.message);
    return;
  }

  notify("Channel created!");

  $("newChannelName").value = "";
  $("newChannelDescription").value = "";

  closeModal("createChannelModal");

  await loadChannels();
}

// Load server members

async function loadServerMembers() {
  if (!selectedServer) return;

  const { data, error } = await db
    .from("server_members")
    .select("user_id,role")
    .eq("server_id", selectedServer.id);

  const list = $("serverMembersList");
  list.innerHTML = "";

  if (error) {
    notify("Member loading error: " + error.message);
    return;
  }

  for (const member of data || []) {
    const { data: profile } = await db
      .from("profiles")
      .select("username")
      .eq("id", member.user_id)
      .maybeSingle();

    if (!profile) continue;

    const row = document.createElement("div");
    row.className = "server-member";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = profile.username[0].toUpperCase();

    const name = document.createElement("span");
    name.textContent =
      profile.username +
      (member.role === "owner" ? " 👑" : "");

    row.append(avatar, name);
    list.appendChild(row);
  }
}

// Join server using invite code

async function joinServer() {
  const code = $("serverInviteCode").value.trim();

  if (!code) {
    notify("Enter an invite code.");
    return;
  }

  const { data, error } = await db.rpc(
    "join_server_by_invite",
    { p_invite_code: code }
  );

  if (error) {
    notify("Could not join server: " + error.message);
    return;
  }

  $("serverInviteCode").value = "";
  closeModal("joinServerModal");

  notify("You joined the server!");

  await loadServers();

  const joinedServer = servers.find(server => server.id === data);

  if (joinedServer) {
    await openServer(joinedServer);
  }
}

// Show invite code

function showServerInvite() {
  if (!selectedServer) {
    notify("Choose a server first.");
    return;
  }

  $("serverInviteCodeDisplay").textContent =
    selectedServer.invite_code;

  openModal("serverInviteModal");
}

// Copy invite code

async function copyServerInvite() {
  if (!selectedServer) return;

  try {
    await navigator.clipboard.writeText(
      selectedServer.invite_code
    );

    notify("Invite code copied!");
  } catch (error) {
    notify("Copy failed. You can select and copy the code manually.");
  }
}

// ==========================================
// BUTTON CONNECTIONS
// ==========================================

$("loginBtn").onclick = login;
$("signupBtn").onclick = signup;

$("logoutBtn").onclick = logout;
$("settingsLogoutBtn").onclick = logout;

$("addFriendBtn").onclick = () => addFriend();
$("homeAddFriendBtn").onclick = () => addFriend();

$("messageForm").onsubmit = sendMessage;

// Navigation buttons

document.querySelectorAll(".server-icon[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    switchView(button.dataset.view);
  });
});

// Server buttons

$("createServerBtn").onclick = () => {
  $("newServerName").value = "";
  openModal("createServerModal");
};

$("joinServerBtn").onclick = () => {
  $("serverInviteCode").value = "";
  openModal("joinServerModal");
};

$("confirmCreateServer").onclick = createServer;
$("confirmJoinServer").onclick = joinServer;

$("createChannelBtn").onclick = () => {
  if (!selectedServer) {
    notify("Choose a server first.");
    return;
  }

  $("newChannelName").value = "";
  $("newChannelDescription").value = "";

  openModal("createChannelModal");
};

$("confirmCreateChannel").onclick = createChannel;

$("serverOptionsBtn").onclick = showServerInvite;
$("copyServerInvite").onclick = copyServerInvite;

// User search

$("userSearch").addEventListener("input", event => {
  clearTimeout(searchTimer);

  const query = event.target.value.trim();

  searchTimer = setTimeout(() => {
    searchUsers(query);
  }, 300);
});

// Close search results when clicking elsewhere

document.addEventListener("click", event => {
  if (!event.target.closest(".search-wrap")) {
    $("userSearchResults").innerHTML = "";
  }
});

// ==========================================
// RESTORE LOGIN SESSION
// ==========================================

db.auth.onAuthStateChange((event, session) => {
  if (session?.user && !currentUser) {
    setTimeout(() => loadApp(), 0);
  }

  if (event === "SIGNED_OUT") {
    currentUser = null;
    currentProfile = null;
    currentChat = null;
    selectedServer = null;
    selectedChannel = null;

    showAuth();
  }
});

// ==========================================
// START VEXCHAT
// ==========================================

(async function start() {
  try {
    const { data, error } = await db.auth.getSession();

    if (error) {
      notify(error.message);
      return;
    }

    if (data.session) {
      await loadApp();
    } else {
      showAuth();
    }

  } catch (error) {
    notify("Startup error: " + error.message);
  }
})();
