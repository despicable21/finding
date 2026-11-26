(function () {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const API_URL = (CFG.API_URL || "").trim();
  const IS_DEMO = !API_URL;
  const BLITZ_SECONDS = Number(CFG.BLITZ_SECONDS_PER_QUESTION) || 10;
  const LOCATIONS = CFG.LOCATIONS || {};
  const DEMO_QUESTIONS = window.DEMO_BLITZ_QUESTIONS || [];

  // Ключи localStorage (мягкая защита на устройстве + хранение демо-ников)
  const LS_SUBMITTED_KEY = "signal_kgd_submitted_v1";
  const LS_DEMO_NICKS_KEY = "signal_kgd_demo_nicks_v1";

  // Элементы DOM
  const stageEl = document.getElementById("stage");
  const locBadgeEl = document.getElementById("loc-badge");
  const demoBadgeEl = document.getElementById("demo-badge");
  const progressWrapEl = document.getElementById("progress-wrap");
  const progressLabelEl = document.getElementById("progress-label");
  const progressPercentEl = document.getElementById("progress-percent");
  const progressFillEl = document.getElementById("progress-fill");
  const footerStatusEl = document.getElementById("footer-status");
  const honeypotEl = document.getElementById("honeypot");

  // Определяем локацию из ?src=...
  const urlParams = new URLSearchParams(window.location.search);
  const rawSource = (urlParams.get("src") || "direct").trim().toLowerCase().slice(0, 40);
  const locationLabel = LOCATIONS[rawSource] || rawSource || "Прямой переход";

  locBadgeEl.textContent = "LOC: " + locationLabel.toUpperCase();
  if (IS_DEMO) {
    demoBadgeEl.classList.remove("hidden");
  }

  // Предзагрузка картины «Последний день Помпеи», чтобы в блице не было задержки
  const preloadImg = new Image();
  preloadImg.src = "assets/pompeii.jpg";

  // Описание шагов Блока 1 (выдаются строго по одному)
  const BLOCK1_STEPS = [
    {
      id: "tg",
      eyebrow: "ИДЕНТИФИКАЦИЯ",
      title: "Твой Telegram",
      hint: "Укажи реальный @username без опечаток — если случится совпадение, я напишу туда. Перейти к блицу без ника и пройти анкету дважды нельзя.",
      type: "telegram",
      placeholder: "username"
    },
    {
      id: "age",
      eyebrow: "БАЗА",
      title: "Сколько тебе лет?",
      type: "single",
      options: ["18–21", "22–26", "27–31", "32+"]
    },
    {
      id: "education",
      eyebrow: "БЭКГРАУНД",
      title: "Образование",
      hint: "На кого ты учился (и пригодилось ли это в жизни)?",
      type: "text",
      placeholder: "Например: прикладная математика, БФУ / самоучка..."
    },
    {
      id: "work",
      eyebrow: "ДЕЛО",
      title: "Кем и в какой сфере ты работаешь?",
      hint: "Если ты в IT — укажи конкретную роль (backend, ML, DevOps, founder и т. д.). Просто «айтишник» не засчитывается 😉",
      type: "textarea",
      placeholder: "Чем именно занимаешься и что в этом драйвит..."
    },
    {
      id: "income",
      eyebrow: "МАСШТАБ",
      title: "Про доход (мы же взрослые люди)",
      hint: "Твой примерный доход в месяц?",
      type: "single",
      options: ["Меньше 50к", "50–100к", "100–200к", "200–400к", "400к+"]
    },
    {
      id: "living",
      eyebrow: "БЫТ",
      title: "Как устроен твой быт?",
      type: "single_with_other",
      options: [
        "Живу с родителями",
        "Живу один, готовлю и убираюсь сам",
        "Живу один, сам не готовлю (доставка / рестораны / клининг)",
        "Живу с соседом / снимаю комнату",
        "Другое"
      ],
      otherPlaceholder: "Расскажи коротко, как у тебя устроен быт..."
    },
    {
      id: "favorite",
      eyebrow: "ВКУС И ГЛУБИНА",
      title: "Любимая игра, фильм или книга — и почему именно она тебя цепляет?",
      hint: "Можно назвать что-то одно, главное — почему именно это попало в тебя.",
      type: "textarea",
      placeholder: "Название и пара честных предложений..."
    },
    {
      id: "habits",
      eyebrow: "ЧЕСТНОСТЬ",
      title: "Вредные привычки",
      hint: "Можно выбрать несколько вариантов или дописать свой.",
      type: "multi_with_other",
      options: [
        "Курение / вейп / IQOS",
        "Алкоголь",
        "Короткий контент (Reels / Shorts / TikTok)",
        "Поздний сон / прокрастинация",
        "Нет заметных вредных привычек"
      ],
      otherPlaceholder: "Что-то ещё (необязательно)..."
    },
    {
      id: "intentions",
      eyebrow: "ВЕКТОР",
      title: "Что ты сейчас ищешь?",
      type: "single",
      options: [
        "Серьёзные романтические отношения",
        "Открыт к серьёзному, если совпадём",
        "Просто любопытно, что это за эксперимент"
      ]
    }
  ];

  // Состояние приложения
  const state = {
    phase: "welcome", // welcome | block1 | transition | blitz | submitting | done | blocked
    stepIndex: 0,
    answers: {
      tg: "",
      age: "",
      education: "",
      work: "",
      income: "",
      living: "",
      living_other: "",
      favorite: "",
      habits: [],
      habits_other: "",
      intentions: ""
    },
    sessionId: null,
    blitzQuestions: [],
    blitzIndex: 0,
    blitzAnswers: [],
    timerRaf: null,
    timerDeadline: 0,
    blitzLocked: false,
    demoTelegramText: "",
    submitError: ""
  };

  // --- Утилиты ---
  function normalizeTg(raw) {
    return String(raw || "")
      .trim()
      .replace(/^https?:\/\/t\.me\//i, "")
      .replace(/^@+/, "")
      .toLowerCase();
  }

  function isValidTg(tg) {
    return /^[a-z0-9_]{5,32}$/.test(tg);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(text) {
    footerStatusEl.textContent = text;
  }

  function updateProgress(visible, label, pct) {
    if (!visible) {
      progressWrapEl.classList.add("hidden");
      return;
    }
    progressWrapEl.classList.remove("hidden");
    progressLabelEl.textContent = label;
    progressPercentEl.textContent = Math.round(pct) + "%";
    progressFillEl.style.width = Math.max(4, Math.min(100, pct)) + "%";
  }

  // --- Работа с API (Google Apps Script или DEMO) ---
  function getDemoNicks() {
    try {
      return JSON.parse(localStorage.getItem(LS_DEMO_NICKS_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveDemoNick(tg) {
    try {
      const list = getDemoNicks();
      if (!list.includes(tg)) {
        list.push(tg);
        localStorage.setItem(LS_DEMO_NICKS_KEY, JSON.stringify(list));
      }
    } catch (_) {}
  }

  async function apiCall(payload) {
    if (IS_DEMO) {
      await new Promise((r) => setTimeout(r, 280));
      return handleDemoApi(payload);
    }

    // Используем text/plain, чтобы избежать лишнего CORS preflight в Google Apps Script
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error("HTTP_" + res.status);
    }

    const data = await res.json();
    return data;
  }

  function handleDemoApi(payload) {
    const used = getDemoNicks();
    const tg = normalizeTg(payload.tg_username);

    if (payload.action === "check_tg") {
      return { ok: true, exists: used.includes(tg) };
    }

    if (payload.action === "start_timed") {
      if (used.includes(tg)) {
        return { ok: false, error: "already_submitted" };
      }
      saveDemoNick(tg);
      const questions = DEMO_QUESTIONS.map((q) => ({
        id: q.id,
        category: q.category,
        question: q.question,
        image: q.image,
        options: q.options
      }));
      return {
        ok: true,
        session_id: "demo-" + Date.now(),
        questions
      };
    }

    if (payload.action === "submit_timed") {
      const demoQs = DEMO_QUESTIONS;
      let correctCount = 0;
      const lines = demoQs.map((q, idx) => {
        const ans = (payload.blitz_answers || [])[idx] || {};
        if (ans.timed_out || ans.selected_index === null || ans.selected_index === undefined) {
          return `${idx + 1}. ⏱ ${q.question}\n   Не успел (верно: ${q.options[q.correctIndex]})`;
        }
        const picked = q.options[ans.selected_index] || "—";
        const isCorrect = ans.selected_index === q.correctIndex;
        if (isCorrect) {
          correctCount++;
          return `${idx + 1}. ✅ ${q.question}\n   Ответ: ${picked}`;
        }
        return `${idx + 1}. ❌ ${q.question}\n   Выбрал: ${picked} | Верно: ${q.options[q.correctIndex]}`;
      });

      const a = state.answers;
      const livingText = a.living === "Другое" ? `Другое: ${a.living_other}` : a.living;
      const habitsArr = [...a.habits];
      if (a.habits_other.trim()) habitsArr.push("Другое: " + a.habits_other.trim());

      state.demoTelegramText = [
        `⚡ НОВАЯ АНКЕТА`,
        ``,
        `👤 Telegram: @${tg} (https://t.me/${tg})`,
        `📍 Локация QR: ${locationLabel}`,
        `🎂 Возраст: ${a.age}`,
        `🎓 Образование: ${a.education}`,
        `💼 Работа: ${a.work}`,
        `💰 Доход: ${a.income}`,
        `🏠 Быт: ${livingText}`,
        `🎬 Любимое: ${a.favorite}`,
        `⚠️ Привычки: ${habitsArr.join(", ") || "—"}`,
        `🎯 Ищет: ${a.intentions}`,
        ``,
        `⏱ БЛИЦ: ${correctCount} из ${demoQs.length}`,
        ...lines
      ].join("\n");

      return { ok: true };
    }

    return { ok: false, error: "unknown_action" };
  }

  // --- Рендер экранов ---
  function renderWelcome() {
    state.phase = "welcome";
    updateProgress(false);
    setStatus("SYS: STANDBY");

    stageEl.innerHTML = `
      <div class="screen">
        <div class="eyebrow">ВХОДЯЩИЙ СИГНАЛ</div>
        <h1 class="title">Здравствуй, путник.</h1>
        <p class="lead">
          Я ищу для себя интересного человека с похожими интересами и мировоззрением.
          Возможно, это именно ты — ответь на парочку вопросов.
        </p>
        <div class="callout">
          <strong>Небольшая просьба:</strong> отвечай честно и искренне. Мы все здесь взрослые люди,
          а я правда очень старалась, когда делала этот проект.
        </div>
        <p class="hint">
          Сначала короткие вопросы о тебе, затем — небольшой блиц на время.
          Пройти анкету дважды с одним Telegram-ником не получится.
        </p>
        <div class="actions actions--single">
          <button id="start-btn" class="btn btn--primary" type="button">
            Начать →
          </button>
        </div>
      </div>
    `;

    document.getElementById("start-btn").addEventListener("click", () => {
      state.stepIndex = 0;
      renderBlock1Step();
    });
  }

  function renderBlock1Step(errorText) {
    state.phase = "block1";
    const step = BLOCK1_STEPS[state.stepIndex];
    const total = BLOCK1_STEPS.length;
    const num = state.stepIndex + 1;
    const pct = (num / total) * 100;

    updateProgress(
      true,
      `BLOCK 01 // STEP ${String(num).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
      pct
    );
    setStatus("BLOCK 01: INPUT");

    let controlHtml = "";
    const val = state.answers[step.id];

    if (step.type === "telegram") {
      controlHtml = `
        <div class="field-wrap">
          <div class="input-prefix-wrap">
            <span class="input-prefix">@</span>
            <input
              id="step-input"
              class="text-input text-input--prefixed"
              type="text"
              inputmode="text"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              maxlength="40"
              placeholder="${escapeHtml(step.placeholder)}"
              value="${escapeHtml(val)}"
            />
          </div>
        </div>
      `;
    } else if (step.type === "text") {
      controlHtml = `
        <div class="field-wrap">
          <input
            id="step-input"
            class="text-input"
            type="text"
            maxlength="240"
            placeholder="${escapeHtml(step.placeholder)}"
            value="${escapeHtml(val)}"
          />
        </div>
      `;
    } else if (step.type === "textarea") {
      controlHtml = `
        <div class="field-wrap">
          <textarea
            id="step-input"
            class="textarea-input"
            maxlength="600"
            placeholder="${escapeHtml(step.placeholder)}"
          >${escapeHtml(val)}</textarea>
        </div>
      `;
    } else if (step.type === "single") {
      const letters = ["A", "B", "C", "D", "E", "F"];
      controlHtml = `
        <div class="options-grid">
          ${step.options
            .map(
              (opt, idx) => `
            <button
              type="button"
              class="option-btn ${val === opt ? "is-selected" : ""}"
              data-value="${escapeHtml(opt)}"
            >
              <span class="option-key">${letters[idx] || idx + 1}</span>
              <span>${escapeHtml(opt)}</span>
            </button>
          `
            )
            .join("")}
        </div>
      `;
    } else if (step.type === "single_with_other") {
      const letters = ["A", "B", "C", "D", "E", "F"];
      const showOther = val === "Другое";
      controlHtml = `
        <div class="options-grid">
          ${step.options
            .map(
              (opt, idx) => `
            <button
              type="button"
              class="option-btn ${val === opt ? "is-selected" : ""}"
              data-value="${escapeHtml(opt)}"
            >
              <span class="option-key">${letters[idx] || idx + 1}</span>
              <span>${escapeHtml(opt)}</span>
            </button>
          `
            )
            .join("")}
        </div>
        <div id="other-wrap" class="field-wrap ${showOther ? "" : "hidden"}">
          <input
            id="other-input"
            class="text-input"
            type="text"
            maxlength="200"
            placeholder="${escapeHtml(step.otherPlaceholder)}"
            value="${escapeHtml(state.answers[step.id + "_other"] || "")}"
          />
        </div>
      `;
    } else if (step.type === "multi_with_other") {
      const selected = Array.isArray(val) ? val : [];
      controlHtml = `
        <div class="options-grid">
          ${step.options
            .map((opt) => {
              const isSel = selected.includes(opt);
              return `
              <button
                type="button"
                class="option-btn ${isSel ? "is-selected" : ""}"
                data-value="${escapeHtml(opt)}"
              >
                <span class="option-key">${isSel ? "✓" : "+"}</span>
                <span>${escapeHtml(opt)}</span>
              </button>
            `;
            })
            .join("")}
        </div>
        <div class="field-wrap">
          <input
            id="other-input"
            class="text-input"
            type="text"
            maxlength="200"
            placeholder="${escapeHtml(step.otherPlaceholder)}"
            value="${escapeHtml(state.answers.habits_other || "")}"
          />
        </div>
      `;
    }

    const showNextBtn = step.type !== "single";

    stageEl.innerHTML = `
      <div class="screen">
        <div class="eyebrow">${escapeHtml(step.eyebrow)}</div>
        <h2 class="title">${escapeHtml(step.title)}</h2>
        ${step.hint ? `<p class="hint">${escapeHtml(step.hint)}</p>` : ""}
        ${controlHtml}
        <div id="step-error" class="error-msg ${errorText ? "" : "hidden"}">${escapeHtml(errorText || "")}</div>
        <div class="actions">
          <button id="back-btn" class="btn btn--ghost" type="button">← Назад</button>
          ${
            showNextBtn
              ? `<button id="next-btn" class="btn btn--primary" type="button">Дальше →</button>`
              : ""
          }
        </div>
      </div>
    `;

    // Назад
    document.getElementById("back-btn").addEventListener("click", () => {
      saveCurrentInputValue(step);
      if (state.stepIndex === 0) {
        renderWelcome();
      } else {
        state.stepIndex--;
        renderBlock1Step();
      }
    });

    // Обработчики для разных типов полей
    if (step.type === "single") {
      stageEl.querySelectorAll(".option-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.answers[step.id] = btn.getAttribute("data-value");
          btn.classList.add("is-selected");
          setTimeout(() => goNextFromBlock1(), 140);
        });
      });
    } else if (step.type === "single_with_other") {
      const otherWrap = document.getElementById("other-wrap");
      const otherInput = document.getElementById("other-input");
      stageEl.querySelectorAll(".option-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const picked = btn.getAttribute("data-value");
          state.answers[step.id] = picked;
          stageEl.querySelectorAll(".option-btn").forEach((b) => b.classList.remove("is-selected"));
          btn.classList.add("is-selected");
          if (picked === "Другое") {
            otherWrap.classList.remove("hidden");
            otherInput.focus();
          } else {
            otherWrap.classList.add("hidden");
            setTimeout(() => goNextFromBlock1(), 140);
          }
        });
      });
    } else if (step.type === "multi_with_other") {
      const noneLabel = "Нет заметных вредных привычек";
      stageEl.querySelectorAll(".option-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const picked = btn.getAttribute("data-value");
          let arr = Array.isArray(state.answers.habits) ? [...state.answers.habits] : [];
          if (arr.includes(picked)) {
            arr = arr.filter((x) => x !== picked);
          } else {
            if (picked === noneLabel) {
              arr = [noneLabel];
            } else {
              arr = arr.filter((x) => x !== noneLabel);
              arr.push(picked);
            }
          }
          state.answers.habits = arr;
          stageEl.querySelectorAll(".option-btn").forEach((b) => {
            const v = b.getAttribute("data-value");
            const active = arr.includes(v);
            b.classList.toggle("is-selected", active);
            b.querySelector(".option-key").textContent = active ? "✓" : "+";
          });
        });
      });
    }

    const nextBtn = document.getElementById("next-btn");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => handleNextClick(step, nextBtn));
    }

    const inputEl = document.getElementById("step-input");
    if (inputEl) {
      setTimeout(() => inputEl.focus(), 60);
      if (step.type !== "textarea") {
        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (nextBtn) handleNextClick(step, nextBtn);
          }
        });
      }
    }
  }

  function showError(msg) {
    const el = document.getElementById("step-error");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function saveCurrentInputValue(step) {
    const inputEl = document.getElementById("step-input");
    if (inputEl) {
      state.answers[step.id] =
        step.type === "telegram" ? normalizeTg(inputEl.value) : inputEl.value.trim();
    }
    const otherInput = document.getElementById("other-input");
    if (otherInput) {
      if (step.id === "living") state.answers.living_other = otherInput.value.trim();
      if (step.id === "habits") state.answers.habits_other = otherInput.value.trim();
    }
  }

  async function handleNextClick(step, nextBtn) {
    saveCurrentInputValue(step);

    if (step.type === "telegram") {
      const tg = state.answers.tg;
      if (!isValidTg(tg)) {
        showError("Укажи корректный Telegram-ник: 5–32 символа (латиница, цифры или _).");
        return;
      }

      nextBtn.disabled = true;
      nextBtn.textContent = "Проверяю...";
      setStatus("VERIFYING TG...");

      try {
        const res = await apiCall({
          action: "check_tg",
          tg_username: tg
        });

        if (res && res.exists) {
          renderBlocked(
            "С этого Telegram-ника анкета уже была начата или отправлена. Повторное прохождение недоступно."
          );
          return;
        }
        goNextFromBlock1();
      } catch (err) {
        nextBtn.disabled = false;
        nextBtn.textContent = "Дальше →";
        setStatus("NET ERROR");
        showError("Не удалось связаться с сервером. Проверь интернет и попробуй ещё раз.");
      }
      return;
    }

    if (step.type === "text" || step.type === "textarea") {
      if (!state.answers[step.id] || state.answers[step.id].length < 2) {
        showError("Пожалуйста, напиши хотя бы пару слов.");
        return;
      }
    }

    if (step.type === "single_with_other") {
      if (!state.answers[step.id]) {
        showError("Выбери один из вариантов.");
        return;
      }
      if (state.answers[step.id] === "Другое" && !state.answers.living_other) {
        showError("Напиши коротко свой вариант.");
        return;
      }
    }

    if (step.type === "multi_with_other") {
      if (state.answers.habits.length === 0 && !state.answers.habits_other) {
        showError("Выбери хотя бы один пункт или напиши свой вариант.");
        return;
      }
    }

    goNextFromBlock1();
  }

  function goNextFromBlock1() {
    if (state.stepIndex < BLOCK1_STEPS.length - 1) {
      state.stepIndex++;
      renderBlock1Step();
    } else {
      renderTransition();
    }
  }

  // --- Экран-переход между Блоком 1 и Блоком 2 ---
  function renderTransition(errorText) {
    state.phase = "transition";
    updateProgress(true, "BLOCK 01 // COMPLETE", 100);
    setStatus("BLITZ: STANDBY");

    stageEl.innerHTML = `
      <div class="screen">
        <div class="eyebrow">ПОЧТИ ГОТОВО</div>
        <h2 class="title">Огромное спасибо, осталось совсем немного.</h2>
        <p class="lead">
          Впереди короткий блиц — <strong>4 вопроса на время</strong>, по <strong>${BLITZ_SECONDS} секунд</strong> на каждый.
        </p>
        <div class="callout">
          Выбирай ответ сразу. После последнего вопроса (или по окончании таймера)
          анкета <strong>автоматически отправится</strong> — нажимать «Отправить» не понадобится.
        </div>
        <div id="step-error" class="error-msg ${errorText ? "" : "hidden"}">${escapeHtml(errorText || "")}</div>
        <div class="actions">
          <button id="back-btn" class="btn btn--ghost" type="button">← Назад</button>
          <button id="continue-btn" class="btn btn--primary" type="button">Продолжить →</button>
        </div>
      </div>
    `;

    document.getElementById("back-btn").addEventListener("click", () => {
      state.stepIndex = BLOCK1_STEPS.length - 1;
      renderBlock1Step();
    });

    const continueBtn = document.getElementById("continue-btn");
    continueBtn.addEventListener("click", async () => {
      // Дополнительная проверка, что Telegram точно указан
      if (!isValidTg(state.answers.tg)) {
        state.stepIndex = 0;
        renderBlock1Step("Сначала укажи корректный Telegram-ник.");
        return;
      }

      continueBtn.disabled = true;
      continueBtn.textContent = "Запуск...";
      setStatus("LOCKING SESSION...");

      try {
        const livingFinal =
          state.answers.living === "Другое"
            ? `Другое: ${state.answers.living_other}`
            : state.answers.living;
        const habitsFinal = [...state.answers.habits];
        if (state.answers.habits_other) {
          habitsFinal.push(`Другое: ${state.answers.habits_other}`);
        }

        const res = await apiCall({
          action: "start_timed",
          tg_username: state.answers.tg,
          source_code: rawSource,
          source_label: locationLabel,
          honeypot: honeypotEl ? honeypotEl.value : "",
          block1: {
            age: state.answers.age,
            education: state.answers.education,
            work: state.answers.work,
            income: state.answers.income,
            living: livingFinal,
            favorite: state.answers.favorite,
            habits: habitsFinal.join(", "),
            intentions: state.answers.intentions
          }
        });

        if (!res || !res.ok) {
          if (res && res.error === "already_submitted") {
            renderBlocked(
              "С этого Telegram-ника анкета уже была начата или отправлена. Повторное прохождение недоступно."
            );
            return;
          }
          throw new Error((res && res.error) || "start_failed");
        }

        state.sessionId = res.session_id;
        state.blitzQuestions = res.questions || [];
        state.blitzIndex = 0;
        state.blitzAnswers = [];

        if (state.blitzQuestions.length === 0) {
          throw new Error("no_questions");
        }

        renderBlitzQuestion();
      } catch (err) {
        continueBtn.disabled = false;
        continueBtn.textContent = "Продолжить →";
        setStatus("NET ERROR");
        showError("Не удалось запустить блиц. Проверь соединение и нажми «Продолжить» ещё раз.");
      }
    });
  }

  // --- Блок 2: Блиц (по 1 вопросу, 10 секунд на каждый, автоотправка) ---
  function clearBlitzTimer() {
    if (state.timerRaf) {
      cancelAnimationFrame(state.timerRaf);
      state.timerRaf = null;
    }
  }

  function renderBlitzQuestion() {
    clearBlitzTimer();
    state.phase = "blitz";
    state.blitzLocked = false;

    const q = state.blitzQuestions[state.blitzIndex];
    const total = state.blitzQuestions.length;
    const num = state.blitzIndex + 1;
    const letters = ["A", "B", "C", "D"];

    updateProgress(
      true,
      `BLOCK 02 // BLITZ ${String(num).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
      (num / total) * 100
    );
    setStatus("BLITZ: ACTIVE");

    stageEl.innerHTML = `
      <div class="screen">
        <div id="blitz-hud" class="blitz-hud">
          <div class="blitz-hud-top">
            <span class="blitz-cat">${escapeHtml(q.category || "БЛИЦ")}</span>
            <span id="blitz-timer" class="blitz-timer">${BLITZ_SECONDS.toFixed(1)}s</span>
          </div>
          <div class="blitz-bar-track">
            <div id="blitz-bar-fill" class="blitz-bar-fill"></div>
          </div>
        </div>

        ${
          q.image
            ? `
          <div class="artifact-frame">
            <img src="${escapeHtml(q.image)}" alt="Изображение к вопросу" />
            <span class="artifact-tag">ARTIFACT // 0${num}</span>
          </div>
        `
            : ""
        }

        <h2 class="title">${escapeHtml(q.question)}</h2>

        <div class="options-grid">
          ${(q.options || [])
            .map(
              (opt, idx) => `
            <button type="button" class="option-btn" data-idx="${idx}">
              <span class="option-key">${letters[idx] || idx + 1}</span>
              <span>${escapeHtml(opt)}</span>
            </button>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    const hudEl = document.getElementById("blitz-hud");
    const timerEl = document.getElementById("blitz-timer");
    const barFillEl = document.getElementById("blitz-bar-fill");

    const startedAt = performance.now();
    const durationMs = BLITZ_SECONDS * 1000;
    state.timerDeadline = startedAt + durationMs;

    function tick(now) {
      if (state.blitzLocked) return;
      const remainingMs = Math.max(0, state.timerDeadline - now);
      const remainingSec = remainingMs / 1000;
      const ratio = remainingMs / durationMs;

      timerEl.textContent = remainingSec.toFixed(1) + "s";
      barFillEl.style.transform = `scaleX(${ratio})`;

      if (remainingSec <= 3.0) {
        hudEl.classList.add("is-urgent");
      }

      if (remainingMs <= 0) {
        recordBlitzAnswer(null, true, BLITZ_SECONDS);
        return;
      }

      state.timerRaf = requestAnimationFrame(tick);
    }

    state.timerRaf = requestAnimationFrame(tick);

    stageEl.querySelectorAll(".option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.blitzLocked) return;
        const idx = Number(btn.getAttribute("data-idx"));
        const spentSec = Number(((performance.now() - startedAt) / 1000).toFixed(1));
        btn.classList.add("is-selected");
        recordBlitzAnswer(idx, false, spentSec);
      });
    });
  }

  function recordBlitzAnswer(selectedIndex, timedOut, spentSec) {
    if (state.blitzLocked) return;
    state.blitzLocked = true;
    clearBlitzTimer();

    const q = state.blitzQuestions[state.blitzIndex];
    state.blitzAnswers.push({
      question_id: q.id,
      selected_index: selectedIndex,
      timed_out: Boolean(timedOut),
      spent_sec: spentSec
    });

    const delay = timedOut ? 120 : 220;
    setTimeout(() => {
      if (state.blitzIndex < state.blitzQuestions.length - 1) {
        state.blitzIndex++;
        renderBlitzQuestion();
      } else {
        autoSubmitAll();
      }
    }, delay);
  }

  // --- Автоматическая отправка после последнего вопроса ---
  async function autoSubmitAll(attempt = 1) {
    state.phase = "submitting";
    updateProgress(true, "TRANSMITTING // AUTO-SEND", 100);
    setStatus("UPLOADING...");

    stageEl.innerHTML = `
      <div class="screen">
        <div class="loader-wrap">
          <div class="cyber-spinner" aria-hidden="true"></div>
          <div class="eyebrow">ОТПРАВКА ДАННЫХ</div>
          <p class="lead">Фиксирую ответы и передаю анкету…</p>
        </div>
      </div>
    `;

    try {
      const res = await apiCall({
        action: "submit_timed",
        session_id: state.sessionId,
        tg_username: state.answers.tg,
        blitz_answers: state.blitzAnswers
      });

      if (!res || !res.ok) {
        throw new Error((res && res.error) || "submit_failed");
      }

      try {
        localStorage.setItem(LS_SUBMITTED_KEY, state.answers.tg);
      } catch (_) {}

      renderDone();
    } catch (err) {
      if (attempt < 2) {
        setTimeout(() => autoSubmitAll(attempt + 1), 1200);
        return;
      }
      // На случай обрыва связи даём безопасную кнопку повтора отправки
      setStatus("UPLOAD FAILED");
      stageEl.innerHTML = `
        <div class="screen">
          <div class="status-badge status-badge--danger">SIGNAL LOST</div>
          <h2 class="title">Пропала связь при отправке</h2>
          <p class="lead">Твои ответы сохранены на странице — нажми ниже, чтобы повторить передачу.</p>
          <div class="actions actions--single">
            <button id="retry-btn" class="btn btn--primary" type="button">Повторить отправку</button>
          </div>
        </div>
      `;
      document.getElementById("retry-btn").addEventListener("click", () => autoSubmitAll(1));
    }
  }

  function renderDone() {
    state.phase = "done";
    updateProgress(false);
    setStatus("TRANSMISSION: OK");

    const demoBlock = IS_DEMO
      ? `
        <details class="demo-preview" open>
          <summary>[DEMO] Предпросмотр сообщения в Telegram</summary>
          <pre>${escapeHtml(state.demoTelegramText)}</pre>
        </details>
      `
      : "";

    stageEl.innerHTML = `
      <div class="screen">
        <div class="status-badge">✓ TRANSMISSION COMPLETE</div>
        <h2 class="title">Спасибо, анкета отправлена.</h2>
        <p class="lead">
          Твои ответы уже у меня. Если почувствую, что мы на одной волне — напишу тебе в Telegram
          (<strong>@${escapeHtml(state.answers.tg)}</strong>).
        </p>
        <p class="hint">
          Хорошего дня в Калининграде.
        </p>
        ${demoBlock}
      </div>
    `;
  }

  function renderBlocked(message) {
    state.phase = "blocked";
    clearBlitzTimer();
    updateProgress(false);
    setStatus("ACCESS: LOCKED");

    stageEl.innerHTML = `
      <div class="screen">
        <div class="status-badge status-badge--danger">ACCESS DENIED</div>
        <h2 class="title">Повторная попытка недоступна</h2>
        <p class="lead">${escapeHtml(message)}</p>
        <p class="hint">
          По правилам анкету можно пройти только один раз с одного Telegram-ника.
        </p>
      </div>
    `;
  }

  // Старт приложения
  renderWelcome();
})();
