// Small helpers
function showMessage(el, text, type) {
  el.textContent = text;
  el.className = "message " + type;
}

function getTableData(tbody) {
  const rows = Array.from(tbody.querySelectorAll("tr"));
  return rows
    .map((row) => {
      const inputs = row.querySelectorAll("input");
      if (!inputs.length) return null;
      const [k, v, d] = inputs;
      if (!k.value.trim()) return null;
      return {
        key: k.value.trim(),
        value: v ? v.value.trim() : "",
        description: d ? d.value.trim() : "",
      };
    })
    .filter(Boolean);
}

function addBlankRow(tbody) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input /></td>
    <td><input /></td>
    <td><input /></td>
    <td><button class="btn-delete-row">×</button></td>
  `;
  tbody.appendChild(tr);
}

// Flatten object for field detection
function collectFieldPaths(obj, prefix = "", paths = new Set(), depth = 0) {
  if (depth > 6 || paths.size > 300) return paths;
  if (Array.isArray(obj)) {
    if (obj.length > 0) collectFieldPaths(obj[0], prefix, paths, depth + 1);
    return paths;
  }
  if (obj && typeof obj === "object") {
    Object.keys(obj).forEach((k) => {
      const newPrefix = prefix ? `${prefix}.${k}` : k;
      const v = obj[k];
      if (v && typeof v === "object") {
        collectFieldPaths(v, newPrefix, paths, depth + 1);
      } else {
        paths.add(newPrefix);
      }
    });
  }
  return paths;
}

// Global auth configs
let savedAPIs = [];

// Modal refs
let modal, modalJson, modalClose, modalCopy, modalOk;

// Store preview responses per block
const blockPreviewMap = new WeakMap();

document.addEventListener("DOMContentLoaded", () => {
  // Parent tabs
  document.querySelectorAll(".parent-tab").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".parent-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".parent-content").forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      const target = document.getElementById(tab.dataset.parentTarget);
      if (target) target.classList.add("active");
    });
  });

  // Modal setup
  modal = document.getElementById("preview-modal");
  modalJson = document.getElementById("modal-json");
  modalClose = document.getElementById("modal-close");
  modalCopy = document.getElementById("modal-copy");
  modalOk = document.getElementById("modal-ok");

  modalClose.addEventListener("click", () => (modal.style.display = "none"));
  modalOk.addEventListener("click", () => (modal.style.display = "none"));
  modalCopy.addEventListener("click", () => {
    navigator.clipboard
      .writeText(modalJson.textContent || "")
      .then(() => alert("JSON copied to clipboard"))
      .catch(() => alert("Unable to copy in this context."));
  });
  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  initAuthSection();
  initDataBlocks();
});

/******** AUTH SECTION ********/
function initAuthSection() {
  const savedStr = localStorage.getItem("savedAuthAPIs");
  savedAPIs = savedStr ? JSON.parse(savedStr) : [];

  const msgEl = document.getElementById("auth-save-message");
  const saveBtn = document.getElementById("auth-save-btn");
  const sendBtn = document.getElementById("auth-send-btn");

  // auth tabs
  document.querySelectorAll(".auth-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.stopPropagation();
      const targetId = tab.dataset.tabTarget;
      document.querySelectorAll(".auth-tabs .tab").forEach((t) => t.classList.remove("active"));
      document
        .querySelectorAll("#auth-panel .tab-content")
        .forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      const target = document.getElementById(targetId);
      if (target) target.classList.add("active");
    });
  });

  // auth type cards
  document.querySelectorAll("#auth-type-grid .auth-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      document
        .querySelectorAll("#auth-type-grid .auth-card")
        .forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
    });
  });

  // row add
  document.querySelectorAll("[data-add-row]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.addRow;
      const tbody = document.getElementById(id);
      if (tbody) addBlankRow(tbody);
    });
  });

  // delete row generic
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-delete-row")) {
      e.stopPropagation();
      const tr = e.target.closest("tr");
      if (tr) tr.remove();
    }
  });

  // save auth config
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const name = document.getElementById("auth-api-name").value.trim();
    if (!name) {
      showMessage(msgEl, "Enter a configuration name", "error");
      return;
    }
    const config = {
      id: Date.now(),
      name,
      method: document.getElementById("auth-method").value,
      url: document.getElementById("auth-url").value,
      body: document.getElementById("auth-body-content").value,
      tokenPath: document.getElementById("auth-token-path").value,
      tokenExpiryPath: document.getElementById("auth-token-expiry-path").value,
      timeout: document.getElementById("auth-timeout").value,
      retries: document.getElementById("auth-retries").value,
      verifySSL: document.getElementById("auth-verify-ssl").checked,
      cacheToken: document.getElementById("auth-cache-token").checked,
      encryptCreds: document.getElementById("auth-encrypt-creds").checked,
      secretStore: document.getElementById("auth-secret-store").value,
      params: getTableData(document.getElementById("auth-params-body")),
      headers: getTableData(document.getElementById("auth-headers-body")),
      createdAt: new Date().toISOString(),
    };
    savedAPIs.push(config);
    localStorage.setItem("savedAuthAPIs", JSON.stringify(savedAPIs));
    renderSavedAPIs();
    updateSavedAPIDropdowns();
    showMessage(msgEl, `Saved config "${name}"`, "success");
    document.getElementById("auth-api-name").value = "";
  });

  // send auth request (demo, may hit CORS)
  sendBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const method = document.getElementById("auth-method").value;
    const url = document.getElementById("auth-url").value;
    const params = getTableData(document.getElementById("auth-params-body"));
    const headersList = getTableData(document.getElementById("auth-headers-body"));
    const body = document.getElementById("auth-body-content").value;
    const meta = document.getElementById("auth-response-meta");
    const box = document.getElementById("auth-response-box");

    box.textContent = "Sending request...";
    meta.textContent = "";

    let fullUrl = url;
    try {
      const u = new URL(url);
      params.forEach((p) => {
        if (p.key && p.value) u.searchParams.append(p.key, p.value);
      });
      fullUrl = u.toString();
    } catch {
      // ignore
    }

    const headers = {};
    headersList.forEach((h) => {
      if (h.key) headers[h.key] = h.value;
    });

    const options = { method, headers };
    if (method !== "GET" && method !== "HEAD" && body) {
      options.body = body;
    }

    const start = performance.now();
    try {
      const res = await fetch(fullUrl, options);
      const elapsed = Math.round(performance.now() - start);
      meta.textContent = `${res.status} ${res.statusText} • ${elapsed}ms`;
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const json = await res.json();
        box.textContent = JSON.stringify(json, null, 2);
      } else {
        const txt = await res.text();
        box.textContent = txt;
      }
    } catch (err) {
      meta.textContent = "ERROR";
      box.textContent =
        "Browser could not call this endpoint directly (likely CORS).\n" +
        "Use this UI as a config builder and execute API calls in backend.\n\n" +
        "Details: " +
        err.message;
    }
  });

  renderSavedAPIs();
}

function renderSavedAPIs() {
  const section = document.getElementById("saved-apis-section");
  const container = document.getElementById("saved-apis-container");
  container.innerHTML = "";
  if (!savedAPIs.length) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";
  savedAPIs.forEach((api) => {
    const div = document.createElement("div");
    div.className = "saved-api-item";
    div.innerHTML = `
      <div>
        <div class="saved-api-name">${api.name}</div>
        <div class="saved-api-url">${api.method} ${api.url}</div>
      </div>
      <div>
        <button class="btn btn-small btn-outline" data-edit-id="${api.id}">Edit</button>
        <button class="btn-delete-row" data-del-id="${api.id}">×</button>
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.editId, 10);
      const api = savedAPIs.find((a) => a.id === id);
      if (!api) return;
      document.getElementById("auth-method").value = api.method;
      document.getElementById("auth-url").value = api.url;
      document.getElementById("auth-body-content").value = api.body || "";
      document.getElementById("auth-token-path").value = api.tokenPath || "";
      document.getElementById("auth-token-expiry-path").value = api.tokenExpiryPath || "";
      document.getElementById("auth-timeout").value = api.timeout || "";
      document.getElementById("auth-retries").value = api.retries || "";
      document.getElementById("auth-verify-ssl").checked = !!api.verifySSL;
      document.getElementById("auth-cache-token").checked = !!api.cacheToken;
      document.getElementById("auth-encrypt-creds").checked = !!api.encryptCreds;
      document.getElementById("auth-secret-store").value = api.secretStore || "local-encrypted";
      showMessage(
        document.getElementById("auth-save-message"),
        `Loaded config: ${api.name}`,
        "success"
      );
    });
  });

  container.querySelectorAll("[data-del-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.delId, 10);
      if (!confirm("Delete this auth configuration?")) return;
      savedAPIs = savedAPIs.filter((a) => a.id !== id);
      localStorage.setItem("savedAuthAPIs", JSON.stringify(savedAPIs));
      renderSavedAPIs();
      updateSavedAPIDropdowns();
    });
  });
}

/******** DATA BLOCKS ********/
function initDataBlocks() {
  const container = document.getElementById("data-blocks-container");
  const template = document.getElementById("data-block-template");
  const addRoot = document.getElementById("add-root-block");

  function createBlock(isNested = false) {
    const node = template.content.firstElementChild.cloneNode(true);
    wireBlock(node, isNested);
    return node;
  }

  function wireBlock(block, isNested) {
    // Tabs (scoped)
    block.querySelectorAll(".data-tabs .tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetClass = tab.dataset.tabTarget;
        const tabs = block.querySelectorAll(".data-tabs .tab");
        const contents = block.querySelectorAll(".tab-content");
        tabs.forEach((t) => t.classList.remove("active"));
        contents.forEach((c) => c.classList.remove("active"));
        tab.classList.add("active");
        const content = block.querySelector("." + targetClass);
        if (content) content.classList.add("active");
      });
    });

    // Remove block button
    const removeBtn = block.querySelector(".btn-remove-block");
    if (isNested || container.children.length > 0) {
      removeBtn.style.display = "inline-flex";
    }
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm("Remove this block?")) return;
      block.remove();
    });

    // Add row buttons in this block
    block.querySelectorAll(".add-row-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cls = btn.dataset.table;
        const tbody = block.querySelector("." + cls);
        if (tbody) addBlankRow(tbody);
      });
    });

    // Saved Auth dropdown
    const savedSel = block.querySelector(".saved-api-dropdown");
    savedSel.addEventListener("click", (e) => e.stopPropagation());
    savedSel.addEventListener("change", (e) => {
      e.stopPropagation();
      const id = parseInt(savedSel.value, 10);
      const api = savedAPIs.find((a) => a.id === id);
      if (!api) return;
      const urlInput = block.querySelector(".data-url");
      if (urlInput && !urlInput.value) urlInput.value = api.url;
    });

    // API type change => SOAP / GraphQL
    const apiTypeSel = block.querySelector(".data-api-type");
    const soapSection = block.querySelector(".soap-section");
    const gqlSection = block.querySelector(".graphql-section");
    apiTypeSel.addEventListener("change", (e) => {
      e.stopPropagation();
      const v = apiTypeSel.value;
      if (soapSection) soapSection.style.display = v === "soap" ? "block" : "none";
      if (gqlSection) gqlSection.style.display = v === "graphql" ? "block" : "none";
    });

    // Columns: detect, select all, clear, add manual
    const columnsList = block.querySelector(".columns-list");
    const detectBtn = block.querySelector(".btn-detect-columns");
    const selectAllBtn = block.querySelector(".btn-columns-select-all");
    const clearBtn = block.querySelector(".btn-columns-clear");
    const manualInput = block.querySelector(".manual-column-input");
    const addManualBtn = block.querySelector(".btn-add-manual-column");

    detectBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const fields = detectColumnsForBlock(block);
      renderColumns(columnsList, fields);
    });

    selectAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      columnsList.querySelectorAll("input[type='checkbox']").forEach((cb) => {
        cb.checked = true;
      });
    });

    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      columnsList.innerHTML = "";
    });

    addManualBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = manualInput.value.trim();
      if (!val) return;
      const existing = Array.from(
        columnsList.querySelectorAll(".column-item span")
      ).some((s) => s.textContent === val);
      if (!existing) {
        const item = document.createElement("div");
        item.className = "column-item";
        item.innerHTML = `<input type="checkbox" checked /> <span>${val}</span>`;
        columnsList.appendChild(item);
      }
      manualInput.value = "";
    });

    // Generate mapping from selected columns
    const genMappingBtn = block.querySelector(".btn-generate-mapping");
    genMappingBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const mappingBody = block.querySelector(".mapping-body");
      mappingBody.innerHTML = "";
      const selected = Array.from(
        columnsList.querySelectorAll(".column-item input[type='checkbox']:checked")
      ).map((cb) => cb.nextElementSibling.textContent);
      if (!selected.length) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          '<td><input /></td><td><input /></td><td><input placeholder="STRING / INT / DATE" /></td><td><input /></td><td><button class="btn-delete-row">×</button></td>';
        mappingBody.appendChild(tr);
        return;
      }
      selected.forEach((field) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><input value="${field}" /></td>
          <td><input value="${field.replace(/\./g, '_')}" /></td>
          <td><input placeholder="STRING / INT / DATE" /></td>
          <td><input /></td>
          <td><button class="btn-delete-row">×</button></td>
        `;
        mappingBody.appendChild(tr);
      });
    });

    // Add sub-block
    const addSubBtn = block.querySelector(".btn-add-sub-block");
    const nestedContainer = block.querySelector(".nested-blocks");
    addSubBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const child = createBlock(true);
      nestedContainer.appendChild(child);
    });

    // Preview config (also used as "Send"/test placeholder)
    block.querySelectorAll(".btn-preview-config").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const config = extractBlockConfig(block);
        modalJson.textContent = JSON.stringify(config, null, 2);
        modal.style.display = "flex";
      });
    });

    // You could wire an actual fetch for preview response per block here
    // and then call `blockPreviewMap.set(block, responseJson)`
  }

  // Create initial root block
  const firstBlock = createBlock(false);
  container.appendChild(firstBlock);

  // Add root block
  addRoot.addEventListener("click", (e) => {
    e.stopPropagation();
    const block = createBlock(false);
    container.appendChild(block);
  });

  updateSavedAPIDropdowns();
}

// Update all saved auth dropdowns
function updateSavedAPIDropdowns() {
  document.querySelectorAll(".saved-api-dropdown").forEach((sel) => {
    const prev = sel.value;
    sel.innerHTML = '<option value="">-- Select saved Auth config --</option>';
    savedAPIs.forEach((api) => {
      const opt = document.createElement("option");
      opt.value = api.id;
      opt.textContent = `${api.name} (${api.method} ${api.url})`;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  });
}

// Detect columns for a block: Sample → Preview → Manual
function detectColumnsForBlock(block) {
  let sourceJson = null;

  // 1. Sample response
  const sample = block.querySelector(".sample-response")?.value?.trim();
  if (sample) {
    try {
      sourceJson = JSON.parse(sample);
    } catch {
      sourceJson = null;
    }
  }

  // 2. Preview response stored in map (if we ever use live preview)
  if (!sourceJson && blockPreviewMap.has(block)) {
    sourceJson = blockPreviewMap.get(block);
  }

  // 3. Fallback: no auto detection
  if (!sourceJson) {
    alert("No sample or preview response available. Add sample JSON or manual fields.");
    return [];
  }

  // Derive field paths
  const paths = collectFieldPaths(sourceJson);
  return Array.from(paths).sort();
}

function renderColumns(container, fields) {
  container.innerHTML = "";
  fields.forEach((f) => {
    const item = document.createElement("div");
    item.className = "column-item";
    item.innerHTML = `<input type="checkbox" checked /> <span>${f}</span>`;
    container.appendChild(item);
  });
}

// Extract config JSON for a given block
function extractBlockConfig(block) {
  const getVal = (selector) => block.querySelector(selector)?.value || "";
  const getBool = (selector) => !!block.querySelector(selector)?.checked;

  const columnsSelected = Array.from(
    block.querySelectorAll(".columns-list .column-item input[type='checkbox']:checked")
  ).map((cb) => cb.nextElementSibling.textContent);

  const mappingRows = Array.from(block.querySelectorAll(".mapping-body tr"))
    .map((tr) => {
      const ins = tr.querySelectorAll("input");
      if (!ins.length || !ins[0].value.trim()) return null;
      return {
        source: ins[0].value.trim(),
        target: ins[1]?.value.trim() || "",
        type: ins[2]?.value.trim() || "",
        transform: ins[3]?.value.trim() || "",
      };
    })
    .filter(Boolean);

  const nestedBlocks = Array.from(
    block.querySelectorAll(":scope > .nested-blocks > .data-block")
  ).map((child) => extractBlockConfig(child));

  const cfg = {
    condition: getVal(".block-condition") || null,
    request: {
      method: getVal(".data-method") || "GET",
      url: getVal(".data-url"),
      savedAuthConfigId: parseInt(
        block.querySelector(".saved-api-dropdown")?.value || "0",
        10
      ) || null,
      queryParams: getTableData(block.querySelector(".data-params-body")),
      headers: getTableData(block.querySelector(".data-headers-body")),
      body: block.querySelector(".data-body-content")?.value || "",
    },
    auth: {
      method: getVal(".data-auth-method"),
      tokenPlacement: getVal(".data-token-placement"),
      tokenPrefix: getVal(".data-token-prefix"),
    },
    pagination: {
      type: getVal(".pagination-type") || "none",
      offsetParam: getVal(".offset-param"),
      limitParam: getVal(".limit-param"),
      initialOffset: getVal(".initial-offset"),
      recordsPerPage: getVal(".records-per-page"),
      cursorPath: getVal(".cursor-path"),
      hasNextPath: getVal(".has-next-path"),
      nextLinkPath: getVal(".next-link-path"),
      nextTokenPath: getVal(".next-token-path"),
      autoPaginate: getBool(".auto-paginate"),
      stopOnEmpty: getBool(".stop-empty"),
    },
    extraction: {
      rootPath: getVal(".root-path"),
      dataPath: getVal(".data-object-path"),
      idField: getVal(".record-id-field"),
      flattenNested: getBool(".flatten-nested"),
      handleArrays: getBool(".handle-arrays"),
      sampleResponse: block.querySelector(".sample-response")?.value || "",
    },
    columns: {
      selected: columnsSelected,
    },
    mapping: {
      rows: mappingRows,
    },
    rules: {
      successExpression: getVal(".success-path"),
      errorMessagePath: getVal(".error-message-path"),
      recordCountPath: getVal(".record-count-path"),
      minRecords: getVal(".min-records"),
      maxRecords: getVal(".max-records"),
      requiredFields: getVal(".required-fields"),
      validateSchema: getBool(".validate-schema"),
      preRequestScript: block.querySelector(".pre-request-script")?.value || "",
      postResponseScript: block.querySelector(".post-response-script")?.value || "",
    },
    settings: {
      apiType: getVal(".data-api-type") || "rest",
      authType: getVal(".data-auth-type-setting"),
      dateFormat: getVal(".data-date-format"),
      timezone: getVal(".data-timezone"),
      retryLimit: getVal(".data-retry-limit"),
      sleepTimeMs: getVal(".data-sleep-time"),
      rate: {
        perSecond: getVal(".rate-req-per-sec"),
        perMinute: getVal(".rate-req-per-min"),
        coolOffSeconds: getVal(".rate-cooloff"),
        retryOnCodes: getVal(".rate-status-codes"),
      },
      load: {
        type: getVal(".load-type") || "full",
        incrementalKey: getVal(".incremental-key"),
        sortOrder: getVal(".incremental-sort") || "asc",
      },
      responseFormat: getVal(".data-response-format"),
      sslDisable: getBool(".data-ssl-disable"),
      active: getBool(".data-active"),
    },
    children: nestedBlocks,
  };

  // SOAP / GraphQL extras
  if (cfg.settings.apiType === "soap") {
    cfg.settings.soap = {
      wsdl: getVal(".soap-wsdl"),
      action: getVal(".soap-action"),
      envelopeTemplate: block.querySelector(".soap-envelope")?.value || "",
    };
  } else if (cfg.settings.apiType === "graphql") {
    cfg.settings.graphql = {
      query: block.querySelector(".graphql-query")?.value || "",
      rootPath: getVal(".graphql-root-path"),
      hasNextPath: getVal(".graphql-hasnext-path"),
      cursorPath: getVal(".graphql-cursor-path"),
    };
  }

  return cfg;
}
