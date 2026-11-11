
/* ==========================================
   VEXCHAT - COMPLETE FRONTEND
   Supabase + Discord-style interface
========================================== */

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
let currentServer = null;
let currentChannel = null;
let chatMode = "none";
let messageSubscription = null;
let friends = [];
let servers = [];
let searchTimer = null;

// ==========================================
// NOTIFICATIONS
// ==========================================

function notify(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.style.display = "block";

  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

function showError(message) {
  $("authError").textContent = message;
}

async function removeMessageSubscription() {
  if (messageSubscription) {
    await db.removeChannel(messageSubscription);
    messageSubscription = null;
  }
}

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

function showWelcome() {
  $("welcome").classList.remove("hidden");
  $("messages").classList.add("hidden");
  $("messageForm").classList.add("hidden");
  $("settingsView").classList.add("hidden");

  $("chatTitle").textContent = "Welcome to VEXCHAT";
  $("chatSubtitle").textContent = "Choose a friend or channel to chat.";

  chatMode = "none";
  currentChat = null;
  currentChannel = null;
}

async function switchView(view) {
  await removeMessageSubscription();

  $("welcome").classList.add("hidden");
  $("messages").classList.add("hidden");
  $("messageForm").classList.add("hidden");
  $("settingsView").classList.add("hidden");
  $("serverPanel").classList.add("hidden");
  $("directMessagePanel").classList.remove("hidden");
  $("memberSidebar").classList.add("hidden");

  document.querySelectorAll(".server-icon[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  chatMode = "none";
  currentChat = null;
  currentChannel = null;

  if (view === "home") {
    showWelcome();
  }

  if (view === "messages") {
    $("chatTitle").textContent = "Direct Messages";
    $("chatSubtitle").textContent = "Choose a friend to start chatting.";
    $("welcome").classList.remove("hidden");
  }

  if (view === "settings") {
    $("settingsView").classList.remove("hidden");
    $("settingsUsername").textContent = currentProfile?.username || "User";
    $("settingsEmail").textContent = currentUser?.email || "Not available";
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
      showError("Account created! Check your email if confirmation is required.");
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
  await removeMessageSubscription();

  const { error } = await db.auth.signOut();

  if (error) {
    notify(error.message);
    return;
  }

  currentUser = null;
  currentProfile = null;
  currentChat = null;
  currentServer = null;
  currentChannel = null;
  friends = [];
  servers = [];

  $("friendsList").innerHTML = "";
  $("requestsList").innerHTML = "";
  $("serverList").innerHTML = "";
  $("channelList").innerHTML = "";

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
    showWelcome();

    await loadFriends();
    await loadRequests();
    await loadServers();

  } catch (error) {
    notify("Loading error: " + error.message);
  }
}

// ==========================================
// FRIENDS
// ==========================================

async function loadFriends() {
  const { data, error } = await db
    .from("friendships")
    .select("*")
    .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
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
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No friends yet. Add someone to start chatting!";
    list.appendChild(empty);
    return;
  }

  friends.forEach(friend => {
    const item = document.createElement("div");
    item.className = "friend";

    if (currentChat?.id === friend.id && chatMode === "direct") {
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
  const username =
    usernameFromSearch || prompt("Enter your friend's username:");

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
    const empty = document.createElement("div");
    empty.className = "search-result";
    empty.textContent = "No users found.";
    results.appendChild(empty);
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
  await removeMessageSubscription();

  currentChat = friend;
  currentChannel = null;
  chatMode = "direct";

  $("serverPanel").classList.add("hidden");
  $("directMessagePanel").classList.remove("hidden");
  $("memberSidebar").classList.add("hidden");

  $("welcome").classList.add("hidden");
  $("settingsView").classList.add("hidden");
  $("messages").classList.remove("hidden");
  $("messageForm").classList.remove("hidden");

  $("chatTitle").textContent = friend.username;
  $("chatSubtitle").textContent = "Direct messages";
  $("headerHash").textContent = "";

  renderFriends();
  await loadMessages();

  messageSubscription = db
    .channel("direct-" + currentUser.id + "-" + friend.id)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages"
    }, payload => {
      const message = payload.new;

      const belongsToChat =
        (message.sender_id === currentUser.id &&
         message.receiver_id === friend.id) ||
        (message.sender_id === friend.id &&
         message.receiver_id === currentUser.id);

      if (belongsToChat) {
        displayMessage(
          message,
          message.sender_id === currentUser.id ? "You" : friend.username
        );
      }
    })
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

  for (const message of data || []) {
    displayMessage(
      message,
      message.sender_id === currentUser.id ? "You" : currentChat.username
    );
  }
}

// ==========================================
// SERVER LIST
// ==========================================

async function loadServers() {
  const { data: memberships, error } = await db
    .from("server_members")
    .select("server_id")
    .eq("user_id", currentUser.id);

  if (error) {
    notify("Server list error: " + error.message);
    return;
  }

  servers = [];

  for (const membership of memberships || []) {
    const { data: server, error: serverError } = await db
      .from("servers")
      .select("id,name")
      .eq("id", membership.server_id)
      .maybeSingle();

    if (serverError) {
      notify("Could not load a server: " + serverError.message);
      continue;
    }

    if (server) servers.push(server);
  }

  renderServers();
}

function renderServers() {
  const list = $("serverList");
  list.innerHTML = "";

  servers.forEach(server => {
    const button = document.createElement("button");
    button.className = "server-icon";
    button.title = server.name;
    button.textContent = server.name.charAt(0).toUpperCase();

    if (currentServer?.id === server.id) {
      button.classList.add("active");
    }

    button.onclick = () => openServer(server);
    list.appendChild(button);
  });
}

// ==========================================
// CREATE SERVER
// ==========================================

async function createServer() {
  const name = prompt("What should your server be called?");

  if (!name || !name.trim()) return;

  const { data: server, error } = await db
    .from("servers")
    .insert({
      name: name.trim(),
      owner_id: currentUser.id
    })
    .select("id,name")
    .single();

  if (error) {
    notify("Could not create server: " + error.message);
    return;
  }

  const { error: memberError } = await db
    .from("server_members")
    .insert({
      server_id: server.id,
      user_id: currentUser.id
    });

  if (memberError) {
    notify("Server created, but membership failed: " + memberError.message);
    return;
  }

  const { error: channelError } = await db
    .from("server_channels")
    .insert({
      server_id: server.id,
      name: "general"
    });

  if (channelError) {
    notify("Server created, but default channel failed: " + channelError.message);
  } else {
    notify("Server created!");
  }

  await loadServers();
  await openServer(server);
}

// ==========================================
// OPEN SERVER
// ==========================================

async function openServer(server) {
  await removeMessageSubscription();

  currentServer = server;
  currentChannel = null;
  currentChat = null;
  chatMode = "server";

  $("serverPanel").classList.remove("hidden");
  $("directMessagePanel").classList.add("hidden");
  $("memberSidebar").classList.remove("hidden");

  $("selectedServerName").textContent = server.name;
  $("channelList").innerHTML = "";

  $("welcome").classList.remove("hidden");
  $("messages").classList.add("hidden");
  $("messageForm").classList.add("hidden");
  $("settingsView").classList.add("hidden");

  $("chatTitle").textContent = server.name;
  $("chatSubtitle").textContent = "Choose a channel to start chatting.";
  $("headerHash").textContent = "";

  renderServers();

  await loadServerMembers(server.id);

  const { data: channels, error } = await db
    .from("server_channels")
    .select("*")
    .eq("server_id", server.id)
    .order("name", { ascending: true });

  if (error) {
    notify("Channel error: " + error.message);
    return;
  }

  const list = $("channelList");

  if (!channels || !channels.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No channels yet. Use + to create one.";
    list.appendChild(empty);
    return;
  }

  channels.forEach(channel => {
    const item = document.createElement("div");
    item.className = "channel-item";

    const hash = document.createElement("span");
    hash.className = "channel-hash";
    hash.textContent = "#";

    const name = document.createElement("span");
    name.textContent = channel.name;

    item.append(hash, name);
    item.onclick = () => openChannel(channel, item);

    list.appendChild(item);
  });
}

// ==========================================
// CREATE CHANNEL
// ==========================================

async function createChannel() {
  if (!currentServer) {
    notify("Choose a server first.");
    return;
  }

  const name = prompt("Enter a channel name:");

  if (!name || !name.trim()) return;

  const cleanName = name.trim().toLowerCase().replace(/\s+/g, "-");

  const { error } = await db
    .from("server_channels")
    .insert({
      server_id: currentServer.id,
      name: cleanName
    });

  if (error) {
    notify("Could not create channel: " + error.message);
    return;
  }

  notify("Channel created!");
  await openServer(currentServer);
}

// ==========================================
// OPEN CHANNEL
// ==========================================

async function openChannel(channel, clickedItem) {
  await removeMessageSubscription();

  currentChannel = channel;
  currentChat = null;
  chatMode = "channel";

  document.querySelectorAll(".channel-item").forEach(item => {
    item.classList.remove("selected");
  });

  if (clickedItem) clickedItem.classList.add("selected");

  $("welcome").classList.add("hidden");
  $("settingsView").classList.add("hidden");
  $("messages").classList.remove("hidden");
  $("messageForm").classList.remove("hidden");

  $("chatTitle").textContent = channel.name;
  $("chatSubtitle").textContent = currentServer.name;
  $("headerHash").textContent = "#";

  await loadChannelMessages();

  messageSubscription = db
    .channel("channel-" + channel.id)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "channel_messages",
      filter: "channel_id=eq." + channel.id
    }, async payload => {
      const message = payload.new;
      const senderName = await getUsername(message.sender_id);
      displayMessage(message, senderName);
    })
    .subscribe();
}

// ==========================================
// LOAD CHANNEL MESSAGES
// ==========================================

async function loadChannelMessages() {
  if (!currentChannel) return;

  const { data, error } = await db
    .from("channel_messages")
    .select("*")
    .eq("channel_id", currentChannel.id)
    .order("created_at", { ascending: true });

  if (error) {
    notify("Channel messages error: " + error.message);
    return;
  }

  $("messages").innerHTML = "";

  for (const message of data || []) {
    const senderName = message.sender_id === currentUser.id
      ? "You"
      : await getUsername(message.sender_id);

    displayMessage(message, senderName);
  }
}

// ==========================================
// SERVER MEMBERS
// ==========================================

async function loadServerMembers(serverId) {
  const list = $("serverMembersList");
  list.innerHTML = "";

  const heading = document.createElement("div");
  heading.className = "member-group-title";
  heading.textContent = "ALL MEMBERS";
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
  count.textContent = "MEMBERS — " + memberships.length;
  list.appendChild(count);

  for (const membership of memberships) {
    const { data: profile } = await db
      .from("profiles")
      .select("username")
      .eq("id", membership.user_id)
      .maybeSingle();

    if (!profile) continue;

    const row = document.createElement("div");
    row.className = "member-row";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = profile.username.charAt(0).toUpperCase();

    const name = document.createElement("span");
    name.textContent = profile.username;

    row.append(avatar, name);
    list.appendChild(row);
  }
}

// ==========================================
// USERNAME LOOKUP
// ==========================================

async function getUsername(userId) {
  if (userId === currentUser.id) return "You";

  const { data, error } = await db
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return "User";

  return data.username;
}

// ==========================================
// DISPLAY MESSAGE
// ==========================================

function displayMessage(message, senderName) {
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
  avatar.textContent = senderName.charAt(0).toUpperCase();

  const content = document.createElement("div");
  content.className = "message-content";

  const sender = document.createElement("small");
  sender.textContent = senderName;

  const text = document.createElement("p");
  text.textContent = message.content;

  content.append(sender, text);
  wrapper.append(avatar, content);

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

// ==========================================
// SEND MESSAGE
// ==========================================

async function sendMessage(event) {
  event.preventDefault();

  const input = $("messageInput");
  const content = input.value.trim();

  if (!content) return;

  if (chatMode === "direct" && currentChat) {
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

    return;
  }

  if (chatMode === "channel" && currentChannel) {
    input.value = "";

    const { error } = await db
      .from("channel_messages")
      .insert({
        channel_id: currentChannel.id,
        sender_id: currentUser.id,
        content
      });

    if (error) {
      notify("Could not send channel message: " + error.message);
      input.value = content;
    }

    return;
  }

  notify("Choose a friend or channel first.");
}

// ==========================================
// BUTTONS
// ==========================================

$("loginBtn").onclick = login;
$("signupBtn").onclick = signup;

$("logoutBtn").onclick = logout;
$("settingsLogoutBtn").onclick = logout;

$("addFriendBtn").onclick = () => addFriend();
$("homeAddFriendBtn").onclick = () => addFriend();

$("messageForm").onsubmit = sendMessage;

$("createServerBtn").onclick = createServer;
$("createChannelBtn").onclick = createChannel;

document.querySelectorAll(".server-icon[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    switchView(button.dataset.view);
  });
});

// USER SEARCH

$("userSearch").addEventListener("input", event => {
  clearTimeout(searchTimer);

  const query = event.target.value.trim();

  searchTimer = setTimeout(() => {
    searchUsers(query);
  }, 300);
});

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
    currentServer = null;
    currentChannel = null;
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
