const SUPABASE_URL = "https://hzozgtqhasiuyevpuwmx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6b3pndHFoYXNpdXlldnB1d214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODkzMjMsImV4cCI6MjA4OTg2NTMyM30.-kA5R-hxuUfBuxpoRMzbSM-xrmqHBhA2dt7Un6zM5CM";

const MAX_NAME_LENGTH = 20;
const MAX_MESSAGE_LENGTH = 500;
const MIN_PIN_LENGTH = 4;
const MIN_AUTH_PASSWORD_LENGTH = 8;
const SESSION_STORAGE_KEY = "orbit_guestbook_session";

const ENTRY_ENDPOINT =
  `${SUPABASE_URL}/rest/v1/guestbook_entries_public?select=id,name,message,created_at&order=created_at.desc`;
const CREATE_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/create_guestbook_entry`;
const DELETE_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/delete_guestbook_entry`;
const SIGNUP_ENDPOINT = `${SUPABASE_URL}/auth/v1/signup`;
const LOGIN_ENDPOINT = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
const LOGOUT_ENDPOINT = `${SUPABASE_URL}/auth/v1/logout`;
const USER_ENDPOINT = `${SUPABASE_URL}/auth/v1/user`;
const REFRESH_ENDPOINT = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;

const state = {
  authMode: "signup",
  deletingId: null,
  entries: [],
  member: null,
  session: null,
};

const elements = {
  authGuestState: document.querySelector("#auth-guest-state"),
  authMemberState: document.querySelector("#auth-member-state"),
  authStatus: document.querySelector("#auth-status"),
  cancelDeleteButton: document.querySelector("#cancel-delete-button"),
  confirmDeleteButton: document.querySelector("#confirm-delete-button"),
  connectionStatus: document.querySelector("#connection-status"),
  count: document.querySelector("#entry-count"),
  deleteDialog: document.querySelector("#delete-dialog"),
  deleteForm: document.querySelector("#delete-form"),
  deletePinInput: document.querySelector("#delete-pin-input"),
  deleteStatus: document.querySelector("#delete-status"),
  entriesList: document.querySelector("#entries-list"),
  entriesLoading: document.querySelector("#entries-loading"),
  entryTemplate: document.querySelector("#entry-template"),
  form: document.querySelector("#guestbook-form"),
  formStatus: document.querySelector("#form-status"),
  loginButton: document.querySelector("#login-button"),
  loginEmail: document.querySelector("#login-email"),
  loginForm: document.querySelector("#login-form"),
  loginPassword: document.querySelector("#login-password"),
  logoutButton: document.querySelector("#logout-button"),
  memberEmail: document.querySelector("#member-email"),
  memberName: document.querySelector("#member-name"),
  messageInput: document.querySelector("#message-input"),
  nameHelp: document.querySelector("#name-help"),
  nameInput: document.querySelector("#name-input"),
  pinInput: document.querySelector("#pin-input"),
  refreshButton: document.querySelector("#refresh-button"),
  signupButton: document.querySelector("#signup-button"),
  signupDisplayName: document.querySelector("#signup-display-name"),
  signupEmail: document.querySelector("#signup-email"),
  signupForm: document.querySelector("#signup-form"),
  signupPassword: document.querySelector("#signup-password"),
  syncProfileButton: document.querySelector("#sync-profile-button"),
  submitButton: document.querySelector("#submit-button"),
  tabButtons: [...document.querySelectorAll("[data-auth-mode]")],
};

boot();

function boot() {
  elements.refreshButton.addEventListener("click", () => {
    void loadEntries({ announce: true });
  });

  elements.form.addEventListener("submit", handleCreateSubmit);
  elements.signupForm.addEventListener("submit", handleSignupSubmit);
  elements.loginForm.addEventListener("submit", handleLoginSubmit);
  elements.logoutButton.addEventListener("click", handleLogoutClick);
  elements.syncProfileButton.addEventListener("click", handleSyncProfileName);
  elements.deleteForm.addEventListener("submit", handleDeleteSubmit);
  elements.cancelDeleteButton.addEventListener("click", closeDeleteDialog);
  elements.deleteDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDeleteDialog();
  });

  for (const button of elements.tabButtons) {
    button.addEventListener("click", () => {
      setAuthMode(button.dataset.authMode);
    });
  }

  setAuthMode(state.authMode);
  syncComposerWithMember();
  renderMemberState();
  void restoreSession();
  void loadEntries();
}

async function restoreSession() {
  const storedSession = readStoredSession();
  if (!storedSession?.access_token) {
    setInlineStatus(
      elements.authStatus,
      "회원가입 또는 로그인 후 표시 이름을 방명록에 바로 사용할 수 있습니다.",
      null
    );
    return;
  }

  try {
    const member = await fetchCurrentUser(storedSession.access_token);
    applySession(storedSession, member);
    setInlineStatus(elements.authStatus, "로그인 상태를 복구했습니다.", "success");
  } catch (error) {
    const refreshed = await tryRefreshSession(storedSession.refresh_token);
    if (refreshed) {
      setInlineStatus(elements.authStatus, "세션을 새로 고쳤습니다.", "success");
      return;
    }

    clearSession();
    setInlineStatus(
      elements.authStatus,
      "이전 로그인 상태가 만료되어 다시 로그인해야 합니다.",
      "error"
    );
    console.error(error);
  }
}

async function tryRefreshSession(refreshToken) {
  if (!refreshToken) {
    return false;
  }

  try {
    const payload = await authRequest(REFRESH_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });
    const member = await fetchCurrentUser(payload.access_token);
    applySession(payload, member);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function loadEntries({ announce = false } = {}) {
  setConnectionStatus("Supabase에서 메시지를 불러오는 중입니다.");
  elements.entriesLoading.hidden = false;
  elements.entriesLoading.textContent = "방명록을 불러오는 중입니다.";

  try {
    const data = await supabaseRequest(ENTRY_ENDPOINT, { method: "GET" });
    state.entries = Array.isArray(data) ? data : [];
    renderEntries();
    elements.count.textContent = String(state.entries.length);
    setConnectionStatus(
      `연결 완료. ${state.entries.length}개의 메시지를 표시하고 있습니다.`
    );

    if (announce) {
      setInlineStatus(elements.formStatus, "목록을 새로 불러왔습니다.", "success");
    }
  } catch (error) {
    state.entries = [];
    renderEntries();
    elements.count.textContent = "0";
    setConnectionStatus("방명록을 불러오지 못했습니다. Supabase 연결 상태를 확인하세요.");
    elements.entriesLoading.hidden = false;
    elements.entriesLoading.textContent = normalizeErrorMessage(error);
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  const displayName = elements.signupDisplayName.value.trim();
  const email = elements.signupEmail.value.trim();
  const password = elements.signupPassword.value;

  const validationError = validateSignupForm({ displayName, email, password });
  if (validationError) {
    setInlineStatus(elements.authStatus, validationError, "error");
    return;
  }

  setAuthBusy(true);
  setInlineStatus(elements.authStatus, "회원가입을 처리하는 중입니다.", null);

  try {
    const payload = await authRequest(SIGNUP_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_redirect_to: getAuthRedirectUrl(),
        data: {
          display_name: displayName,
        },
      }),
    });

    if (payload.session && payload.user) {
      applySession(payload.session, payload.user);
      setInlineStatus(
        elements.authStatus,
        "회원가입과 로그인이 완료됐습니다.",
        "success"
      );
    } else {
      elements.signupForm.reset();
      setAuthMode("login");
      setInlineStatus(
        elements.authStatus,
        "회원가입이 완료됐습니다. 이메일 인증 후 로그인하세요.",
        "success"
      );
    }
  } catch (error) {
    setInlineStatus(elements.authStatus, normalizeErrorMessage(error), "error");
  } finally {
    setAuthBusy(false);
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;

  if (!email || !password) {
    setInlineStatus(elements.authStatus, "이메일과 비밀번호를 모두 입력하세요.", "error");
    return;
  }

  setAuthBusy(true);
  setInlineStatus(elements.authStatus, "로그인하는 중입니다.", null);

  try {
    const payload = await authRequest(LOGIN_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
      }),
    });
    const member = payload.user ?? (await fetchCurrentUser(payload.access_token));
    applySession(payload, member);
    elements.loginForm.reset();
    setInlineStatus(elements.authStatus, "로그인됐습니다.", "success");
  } catch (error) {
    setInlineStatus(elements.authStatus, normalizeErrorMessage(error), "error");
  } finally {
    setAuthBusy(false);
  }
}

async function handleLogoutClick() {
  setAuthBusy(true);

  try {
    if (state.session?.access_token) {
      await authRequest(LOGOUT_ENDPOINT, {
        method: "POST",
        accessToken: state.session.access_token,
      });
    }
  } catch (error) {
    console.error(error);
  } finally {
    clearSession();
    setAuthBusy(false);
    setInlineStatus(elements.authStatus, "로그아웃됐습니다.", "success");
  }
}

function handleSyncProfileName() {
  syncComposerWithMember();
  setInlineStatus(elements.formStatus, "계정 표시 이름을 작성 폼에 반영했습니다.", "success");
}

async function handleCreateSubmit(event) {
  event.preventDefault();
  const name = elements.nameInput.value.trim();
  const pin = elements.pinInput.value;
  const message = elements.messageInput.value.trim();

  const validationError = validateCreateForm({ name, pin, message });
  if (validationError) {
    setInlineStatus(elements.formStatus, validationError, "error");
    return;
  }

  setFormBusy(true);
  setInlineStatus(elements.formStatus, "메시지를 저장하는 중입니다.", null);

  try {
    const createdPayload = await supabaseRequest(CREATE_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        entry_name: name,
        entry_message: message,
        entry_password: pin,
      }),
    });
    const createdEntry = pickFirstRow(createdPayload);

    if (createdEntry?.id) {
      state.entries = [createdEntry, ...state.entries];
      renderEntries();
    } else {
      await loadEntries();
    }

    elements.messageInput.value = "";
    elements.pinInput.value = "";
    syncComposerWithMember();
    elements.count.textContent = String(state.entries.length);
    setConnectionStatus("메시지가 저장되었습니다.");
    setInlineStatus(elements.formStatus, "메시지가 등록되었습니다.", "success");
  } catch (error) {
    setInlineStatus(elements.formStatus, normalizeErrorMessage(error), "error");
  } finally {
    setFormBusy(false);
  }
}

function validateSignupForm({ displayName, email, password }) {
  if (displayName.length < 2 || displayName.length > MAX_NAME_LENGTH) {
    return "표시 이름은 2자 이상 20자 이하로 입력하세요.";
  }

  if (!email) {
    return "회원가입에 사용할 이메일을 입력하세요.";
  }

  if (password.length < MIN_AUTH_PASSWORD_LENGTH) {
    return "비밀번호는 최소 8자 이상이어야 합니다.";
  }

  return null;
}

function validateCreateForm({ name, pin, message }) {
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
    return "이름은 2자 이상 20자 이하로 입력하세요.";
  }

  if (pin.length < MIN_PIN_LENGTH) {
    return "삭제용 PIN은 최소 4자 이상이어야 합니다.";
  }

  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return "메시지는 1자 이상 500자 이하로 입력하세요.";
  }

  return null;
}

function renderEntries() {
  elements.entriesList.replaceChildren();

  if (state.entries.length === 0) {
    elements.entriesLoading.hidden = false;
    elements.entriesLoading.textContent =
      "아직 남겨진 메시지가 없습니다. 첫 번째 메시지를 남겨보세요.";
    return;
  }

  elements.entriesLoading.hidden = true;

  for (const entry of state.entries) {
    const fragment = elements.entryTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".entry-card");
    const name = fragment.querySelector(".entry-name");
    const date = fragment.querySelector(".entry-date");
    const message = fragment.querySelector(".entry-message");
    const deleteButton = fragment.querySelector(".delete-button");

    name.textContent = entry.name;
    date.textContent = formatDate(entry.created_at);
    message.textContent = entry.message;
    deleteButton.addEventListener("click", () => openDeleteDialog(entry.id, entry.name));

    card.dataset.entryId = entry.id;
    elements.entriesList.append(card);
  }
}

function openDeleteDialog(entryId, entryName) {
  state.deletingId = entryId;
  elements.deleteForm.dataset.entryId = entryId;
  elements.deleteForm.querySelector("h2").textContent = `${entryName}님의 메시지 삭제`;
  elements.deletePinInput.value = "";
  setInlineStatus(elements.deleteStatus, "", null);

  if (typeof elements.deleteDialog.showModal === "function") {
    elements.deleteDialog.showModal();
  }
}

function closeDeleteDialog() {
  state.deletingId = null;
  elements.deleteForm.dataset.entryId = "";
  setDeleteBusy(false);
  setInlineStatus(elements.deleteStatus, "", null);

  if (elements.deleteDialog.open) {
    elements.deleteDialog.close();
  }
}

async function handleDeleteSubmit(event) {
  event.preventDefault();
  const entryId = state.deletingId;
  const pin = elements.deletePinInput.value;

  if (!entryId) {
    setInlineStatus(elements.deleteStatus, "삭제할 항목을 찾지 못했습니다.", "error");
    return;
  }

  if (pin.length < MIN_PIN_LENGTH) {
    setInlineStatus(elements.deleteStatus, "PIN을 다시 확인하세요.", "error");
    return;
  }

  setDeleteBusy(true);
  setInlineStatus(elements.deleteStatus, "삭제 요청을 처리하는 중입니다.", null);

  try {
    const deletePayload = await supabaseRequest(DELETE_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        entry_id: entryId,
        entry_password: pin,
      }),
    });
    const didDelete = readBooleanResult(deletePayload);

    if (!didDelete) {
      throw new Error("PIN이 일치하지 않거나 이미 삭제된 메시지입니다.");
    }

    state.entries = state.entries.filter((entry) => entry.id !== entryId);
    renderEntries();
    elements.count.textContent = String(state.entries.length);
    setConnectionStatus("메시지가 삭제되었습니다.");
    closeDeleteDialog();
    setInlineStatus(elements.formStatus, "메시지를 삭제했습니다.", "success");
  } catch (error) {
    setInlineStatus(elements.deleteStatus, normalizeErrorMessage(error), "error");
    setDeleteBusy(false);
  }
}

function setAuthMode(mode) {
  state.authMode = mode === "login" ? "login" : "signup";
  const showSignup = state.authMode === "signup";

  elements.signupForm.hidden = !showSignup;
  elements.loginForm.hidden = showSignup;

  for (const button of elements.tabButtons) {
    const isActive = button.dataset.authMode === state.authMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }
}

function applySession(session, member) {
  state.session = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  };
  state.member = member;
  writeStoredSession(state.session);
  renderMemberState();
  syncComposerWithMember();
}

function clearSession() {
  state.session = null;
  state.member = null;
  clearStoredSession();
  renderMemberState();
  syncComposerWithMember();
}

function renderMemberState() {
  const isSignedIn = Boolean(state.member);
  elements.authGuestState.hidden = isSignedIn;
  elements.authMemberState.hidden = !isSignedIn;

  if (!isSignedIn) {
    elements.memberName.textContent = "";
    elements.memberEmail.textContent = "";
    return;
  }

  elements.memberName.textContent = getMemberDisplayName(state.member);
  elements.memberEmail.textContent = state.member.email ?? "";
}

function syncComposerWithMember() {
  if (state.member) {
    elements.nameInput.disabled = true;
    elements.nameInput.value = getMemberDisplayName(state.member);
    elements.nameInput.placeholder = "로그인한 표시 이름 사용";
    elements.nameHelp.textContent =
      "로그인 중이라 이름이 계정 표시 이름으로 고정됩니다.";
    return;
  }

  elements.nameInput.disabled = false;
  elements.nameInput.value = "";
  elements.nameInput.placeholder = "2~20자";
  elements.nameHelp.textContent = "로그인하지 않으면 직접 이름을 입력합니다.";
}

function getMemberDisplayName(member) {
  const profileName = member?.user_metadata?.display_name?.trim();
  if (profileName) {
    return profileName;
  }

  const fallback = member?.email?.split("@")[0]?.trim();
  return fallback || "Member";
}

async function fetchCurrentUser(accessToken) {
  return authRequest(USER_ENDPOINT, {
    method: "GET",
    accessToken,
  });
}

async function authRequest(url, { method = "GET", body, accessToken } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body,
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload) || "인증 요청에 실패했습니다.");
  }

  return payload;
}

function getAuthRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function supabaseRequest(url, { method, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body,
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload) || "Supabase 요청에 실패했습니다.");
  }

  return payload;
}

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function pickFirstRow(payload) {
  if (Array.isArray(payload)) {
    return payload[0] ?? null;
  }

  return payload;
}

function readBooleanResult(payload) {
  if (typeof payload === "boolean") {
    return payload;
  }

  if (Array.isArray(payload)) {
    return readBooleanResult(payload[0]);
  }

  if (payload && typeof payload === "object") {
    const values = Object.values(payload);
    if (values.length === 1 && typeof values[0] === "boolean") {
      return values[0];
    }
  }

  return false;
}

function extractErrorMessage(payload) {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (typeof payload.msg === "string") {
    return payload.msg;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  if (typeof payload.error_description === "string") {
    return payload.error_description;
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  return null;
}

function normalizeErrorMessage(error) {
  const fallback = "요청 처리에 실패했습니다. Supabase 설정을 확인하세요.";
  if (!error) {
    return fallback;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function setConnectionStatus(message) {
  elements.connectionStatus.textContent = message;
}

function setInlineStatus(target, message, tone) {
  target.textContent = message;

  if (tone) {
    target.dataset.tone = tone;
  } else {
    delete target.dataset.tone;
  }
}

function setAuthBusy(isBusy) {
  for (const button of elements.tabButtons) {
    button.disabled = isBusy;
  }

  elements.signupButton.disabled = isBusy;
  elements.loginButton.disabled = isBusy;
  elements.logoutButton.disabled = isBusy;
  elements.syncProfileButton.disabled = isBusy;
  elements.signupDisplayName.disabled = isBusy;
  elements.signupEmail.disabled = isBusy;
  elements.signupPassword.disabled = isBusy;
  elements.loginEmail.disabled = isBusy;
  elements.loginPassword.disabled = isBusy;
}

function setFormBusy(isBusy) {
  elements.submitButton.disabled = isBusy;
  elements.refreshButton.disabled = isBusy;
  elements.nameInput.disabled = isBusy || Boolean(state.member);
  elements.pinInput.disabled = isBusy;
  elements.messageInput.disabled = isBusy;
}

function setDeleteBusy(isBusy) {
  elements.confirmDeleteButton.disabled = isBusy;
  elements.cancelDeleteButton.disabled = isBusy;
  elements.deletePinInput.disabled = isBusy;
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "날짜 정보 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
