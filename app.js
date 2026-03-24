const SUPABASE_URL = "https://hzozgtqhasiuyevpuwmx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6b3pndHFoYXNpdXlldnB1d214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODkzMjMsImV4cCI6MjA4OTg2NTMyM30.-kA5R-hxuUfBuxpoRMzbSM-xrmqHBhA2dt7Un6zM5CM";

const MAX_NAME_LENGTH = 20;
const MAX_MESSAGE_LENGTH = 500;
const MIN_PIN_LENGTH = 4;
const ENTRY_ENDPOINT =
  `${SUPABASE_URL}/rest/v1/guestbook_entries_public?select=id,name,message,created_at&order=created_at.desc`;
const CREATE_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/create_guestbook_entry`;
const DELETE_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/delete_guestbook_entry`;

const state = {
  entries: [],
  deletingId: null,
};

const elements = {
  count: document.querySelector("#entry-count"),
  connectionStatus: document.querySelector("#connection-status"),
  refreshButton: document.querySelector("#refresh-button"),
  form: document.querySelector("#guestbook-form"),
  nameInput: document.querySelector("#name-input"),
  pinInput: document.querySelector("#pin-input"),
  messageInput: document.querySelector("#message-input"),
  submitButton: document.querySelector("#submit-button"),
  formStatus: document.querySelector("#form-status"),
  entriesLoading: document.querySelector("#entries-loading"),
  entriesList: document.querySelector("#entries-list"),
  entryTemplate: document.querySelector("#entry-template"),
  deleteDialog: document.querySelector("#delete-dialog"),
  deleteForm: document.querySelector("#delete-form"),
  deletePinInput: document.querySelector("#delete-pin-input"),
  deleteStatus: document.querySelector("#delete-status"),
  cancelDeleteButton: document.querySelector("#cancel-delete-button"),
  confirmDeleteButton: document.querySelector("#confirm-delete-button"),
};

boot();

function boot() {
  elements.refreshButton.addEventListener("click", () => {
    void loadEntries({ announce: true });
  });

  elements.form.addEventListener("submit", handleCreateSubmit);
  elements.deleteForm.addEventListener("submit", handleDeleteSubmit);
  elements.cancelDeleteButton.addEventListener("click", closeDeleteDialog);
  elements.deleteDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDeleteDialog();
  });

  void loadEntries();
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
    setConnectionStatus(
      "방명록을 불러오지 못했습니다. Supabase SQL 스크립트 적용 여부를 확인하세요."
    );
    elements.entriesLoading.hidden = false;
    elements.entriesLoading.textContent = normalizeErrorMessage(error);
  }
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

    if (createdEntry && createdEntry.id) {
      state.entries = [createdEntry, ...state.entries];
    } else {
      await loadEntries();
    }

    elements.form.reset();
    renderEntries();
    elements.count.textContent = String(state.entries.length);
    setConnectionStatus("메시지가 저장되었습니다.");
    setInlineStatus(elements.formStatus, "메시지가 등록되었습니다.", "success");
  } catch (error) {
    setInlineStatus(elements.formStatus, normalizeErrorMessage(error), "error");
  } finally {
    setFormBusy(false);
  }
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
    deleteButton.dataset.entryId = entry.id;
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

  if (typeof payload.message === "string") {
    return payload.message;
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

function setFormBusy(isBusy) {
  elements.submitButton.disabled = isBusy;
  elements.refreshButton.disabled = isBusy;
  elements.nameInput.disabled = isBusy;
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
