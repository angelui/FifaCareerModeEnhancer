import { escapeHtml } from "../ui.js";

function itemLabel(item) {
  if (typeof item === "string") return item;
  if (!item) return "";
  return String(item.label ?? item.value ?? "");
}

function itemValue(item) {
  if (typeof item === "string") return item;
  if (!item) return "";
  return String(item.value ?? "");
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function filterItems(items, query) {
  const normalized = normalize(query);
  if (!normalized) return items;
  return items.filter((item) => itemLabel(item).toLowerCase().includes(normalized));
}

export function renderCombobox({
  idPrefix,
  label,
  placeholder = "Search...",
  disabled = false,
  hint = "",
  hintVariant = "info",
  selectedValue = "",
  required = false,
  inputName = "",
}) {
  return `
    <div class="combobox ${disabled ? "combobox-disabled" : ""}" data-combobox="${escapeHtml(idPrefix)}">
      <label class="field" for="${idPrefix}-input">
        <span>${escapeHtml(label)}</span>
        <div class="combobox-control">
          <input
            id="${idPrefix}-input"
            class="combobox-input"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="false"
            aria-controls="${idPrefix}-list"
            placeholder="${escapeHtml(placeholder)}"
            autocomplete="off"
            ${disabled ? "disabled" : ""}
            ${required ? "required" : ""}
            value="${escapeHtml(selectedValue)}"
          />
          <ul id="${idPrefix}-list" class="combobox-list" role="listbox" hidden></ul>
        </div>
        <p id="${idPrefix}-status" class="field-hint field-hint-${hintVariant}${hintVariant === "loading" ? " field-hint-with-spinner" : ""}" aria-live="polite">${escapeHtml(hint)}</p>
      </label>
      ${inputName ? `<input type="hidden" id="${idPrefix}-value" name="${escapeHtml(inputName)}" value="${escapeHtml(selectedValue)}" />` : `<input type="hidden" id="${idPrefix}-value" value="${escapeHtml(selectedValue)}" />`}
    </div>
  `;
}

export function mountCombobox(idPrefix, options = {}) {
  const {
    items = [],
    selectedValue = "",
    onSelect,
    disabled = false,
    autoSelectSingle = true,
  } = options;

  const root = document.querySelector(`[data-combobox="${idPrefix}"]`);
  const input = document.getElementById(`${idPrefix}-input`);
  const list = document.getElementById(`${idPrefix}-list`);
  const hidden = document.getElementById(`${idPrefix}-value`);
  const status = document.getElementById(`${idPrefix}-status`);

  if (!input || !list || !hidden || !status) {
    return null;
  }

  let allItems = [...items];
  let highlightedIndex = -1;
  let isOpen = false;
  let lastAutoSelected = selectedValue || "";
  let valueToLabel = new Map();

  function rebuildMaps() {
    valueToLabel = new Map();
    allItems.forEach((item) => {
      const value = itemValue(item);
      if (value !== "") valueToLabel.set(value, itemLabel(item));
    });
  }

  rebuildMaps();

  function applyValue(value, { notify = true } = {}) {
    hidden.value = value;
    input.value = valueToLabel.get(value) ?? value;
    lastAutoSelected = value;
    if (notify && onSelect) onSelect(value);
  }

  const controller = {
    updateItems(nextItems, nextSelected = hidden.value, { renderList: renderListNow = true } = {}) {
      allItems = [...nextItems];
      rebuildMaps();

      // Preserve user's current typing when there is no explicit selection.
      if (nextSelected !== "") {
        applyValue(nextSelected, { notify: false });
      } else {
        hidden.value = "";
        lastAutoSelected = "";
      }

      if (renderListNow) {
        renderList(input.value, { preserveHighlight: false });
      }
      updateStatusFromQuery(input.value);
    },
    setDisabled(nextDisabled) {
      input.disabled = nextDisabled;
      root?.classList.toggle("combobox-disabled", nextDisabled);
      if (nextDisabled) closeList();
    },
    setStatus(message, variant = "info") {
      status.textContent = message;
      status.className = `field-hint field-hint-${variant}${variant === "loading" ? " field-hint-with-spinner" : ""}`;
    },
    setPlaceholder(text) {
      input.placeholder = text;
    },
    getValue() {
      return hidden.value;
    },
    setValue(value, { notify = true } = {}) {
      applyValue(value, { notify });
    },
    destroy() {
      document.removeEventListener("click", onDocumentClick);
      input.removeEventListener("input", onInput);
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("keydown", onKeyDown);
      list.removeEventListener("mousedown", onListMouseDown);
    },
  };

  function getFilteredItems() {
    return filterItems(allItems, input.value);
  }

  function setHighlighted(index) {
    highlightedIndex = index;
    Array.from(list.children).forEach((node, itemIndex) => {
      node.classList.toggle("is-active", itemIndex === highlightedIndex);
      if (itemIndex === highlightedIndex) {
        node.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function openList() {
    if (input.disabled) return;
    isOpen = true;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function closeList() {
    isOpen = false;
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    setHighlighted(-1);
  }

  function choose(value, { notify = true } = {}) {
    if (value === undefined || value === null || value === "") return;

    hidden.value = value;
    input.value = valueToLabel.get(value) ?? value;
    lastAutoSelected = value;
    closeList();
    updateStatusFromQuery(value, { selected: true });

    if (notify && onSelect) onSelect(value);
  }

  function tryAutoSelect(filtered) {
    if (!autoSelectSingle || filtered.length !== 1) return false;

    const [onlyMatch] = filtered;
    const onlyValue = itemValue(onlyMatch);
    if (onlyValue === lastAutoSelected && hidden.value === onlyValue) return true;

    choose(onlyValue);
    return true;
  }

  function updateStatusFromQuery(query, { selected = false } = {}) {
    if (selected && hidden.value) {
      controller.setStatus(`Selected: ${valueToLabel.get(hidden.value) ?? hidden.value}`, "success");
      return;
    }

    const filtered = getFilteredItems();
    const normalized = normalize(query);

    if (!allItems.length) {
      return;
    }

    if (!normalized) {
      controller.setStatus(`${allItems.length} options available. Type to filter, Enter to select.`, "info");
      return;
    }

    if (filtered.length === 0) {
      controller.setStatus(`No clubs match "${query.trim()}". Try a shorter search.`, "error");
      return;
    }

    if (filtered.length === 1) {
      controller.setStatus(`1 match found — press Enter to select "${itemLabel(filtered[0])}".`, "info");
      return;
    }

    controller.setStatus(`${filtered.length} matches. Use ↑↓ and Enter, or keep typing.`, "info");
  }

  function renderList(query, { preserveHighlight = true } = {}) {
    const filtered = getFilteredItems();
    list.innerHTML = filtered
      .slice(0, 80)
      .map(
        (item, index) => `
          <li
            class="combobox-option ${hidden.value === itemValue(item) ? "is-selected" : ""}"
            role="option"
            data-index="${index}"
            data-value="${escapeHtml(itemValue(item))}"
            aria-selected="${hidden.value === itemValue(item) ? "true" : "false"}"
          >
            ${escapeHtml(itemLabel(item))}
          </li>
        `,
      )
      .join("");

    if (filtered.length > 80) {
      list.insertAdjacentHTML(
        "beforeend",
        `<li class="combobox-more" aria-hidden="true">${filtered.length - 80} more — keep typing to narrow down</li>`,
      );
    }

    if (preserveHighlight && highlightedIndex >= filtered.length) {
      setHighlighted(filtered.length - 1);
    }

    if (autoSelectSingle) {
      tryAutoSelect(filtered);
    }
  }

  function onInput() {
    hidden.value = "";
    lastAutoSelected = "";
    openList();
    renderList(input.value, { preserveHighlight: false });
    setHighlighted(getFilteredItems().length ? 0 : -1);
    updateStatusFromQuery(input.value);
  }

  function onFocus() {
    if (input.disabled) return;
    openList();
    renderList(input.value);
    updateStatusFromQuery(input.value);
  }

  function onKeyDown(event) {
    const filtered = getFilteredItems();

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openList();
      if (!filtered.length) return;
      const next = highlightedIndex < filtered.length - 1 ? highlightedIndex + 1 : 0;
      setHighlighted(next);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      openList();
      if (!filtered.length) return;
      const next = highlightedIndex > 0 ? highlightedIndex - 1 : filtered.length - 1;
      setHighlighted(next);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
        choose(itemValue(filtered[highlightedIndex]));
        return;
      }

      if (filtered.length === 1) {
        choose(itemValue(filtered[0]));
        return;
      }

      const exact = filtered.find((item) => normalize(itemLabel(item)) === normalize(input.value));
      if (exact) {
        choose(itemValue(exact));
        return;
      }

      controller.setStatus("Multiple matches — use ↑↓ to highlight one, then press Enter.", "error");
      openList();
      return;
    }

    if (event.key === "Escape") {
      closeList();
      input.blur();
    }
  }

  function onListMouseDown(event) {
    event.preventDefault();
    const option = event.target.closest("[data-value]");
    if (!option) return;
    choose(option.getAttribute("data-value"));
  }

  function onDocumentClick(event) {
    if (!root?.contains(event.target)) {
      closeList();
    }
  }

  input.addEventListener("input", onInput);
  input.addEventListener("focus", onFocus);
  input.addEventListener("keydown", onKeyDown);
  list.addEventListener("mousedown", onListMouseDown);
  document.addEventListener("click", onDocumentClick);

  if (selectedValue !== "") {
    hidden.value = selectedValue;
    input.value = valueToLabel.get(selectedValue) ?? selectedValue;
    lastAutoSelected = selectedValue;
    controller.setStatus(`Selected: ${selectedValue}`, "success");
  } else if (disabled) {
    controller.setStatus("Select a FIFA edition above first — the club list loads after that.", "info");
  } else if (!allItems.length) {
    controller.setStatus("Loading clubs…", "loading");
  } else {
    updateStatusFromQuery("");
  }

  controller.setDisabled(disabled);
  return controller;
}

export function formatLoadError(error) {
  const message = error?.message || "Unknown error";

  if (message.includes("Could not load") || message.includes("fetch") || message.includes("Failed to fetch")) {
    return {
      message: "Could not reach the backend API.",
      hint: "Start the backend (uvicorn) and frontend (npm run dev), then open http://localhost:5173.",
    };
  }

  return {
    message,
    hint: "Check the browser console for details, then try again.",
  };
}
