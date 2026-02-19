// app.js
// Core application logic for the personal diet & fitness tracker SPA.
// Fixes: Smart Merging using Map, Full JSON Backup (Settings + Logs), Local Notifications.

"use strict";

// ----- CONSTANTS & STORAGE KEYS -----

const ENTRIES_STORAGE_KEY = "dietEntries";
const SETTINGS_STORAGE_KEY = "dietUserSettings";

// ----- STATE -----

// Load entries immediately
let entries = loadEntries();

// Load settings immediately
let userSettings = loadSettings();

/** @type {Chart | null} */
let weightChart = null;

// ----- LOCAL STORAGE HELPERS -----

function loadEntries() {
  try {
    const raw = localStorage.getItem(ENTRIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to parse stored entries:", e);
    return [];
  }
}

function saveEntries(list) {
  localStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(list));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const defaults = {
      firstName: "",
      heightCm: null,
      weighInDay: null,
      profilePicUrl: "", // הוספנו לכאן את שדה התמונה כברירת מחדל
    };

    if (!raw) return defaults;

    const parsed = JSON.parse(raw);
    return {
      firstName: parsed.firstName || "",
      heightCm: Number(parsed.heightCm) || null,
      weighInDay:
        typeof parsed.weighInDay === "number" ? parsed.weighInDay : null,
      profilePicUrl: parsed.profilePicUrl || "", // התוספת הקריטית ששולפת את הלינק!
    };
  } catch (e) {
    console.error("Failed to parse user settings:", e);
    return {
      firstName: "",
      heightCm: null,
      weighInDay: null,
      profilePicUrl: "",
    };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

// ----- DATE HELPERS -----

function getTodayDateString() {
  const today = new Date();
  return formatDateToYMD(today);
}

function formatDateToYMD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromYMD(ymd) {
  if (!ymd) return new Date();
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function hasEntryOnDate(dateStr) {
  return entries.some((e) => e.date === dateStr);
}

// ----- UI & DASHBOARD FUNCTIONS -----

function getTimeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "בוקר טוב";
  if (hour < 18) return "צהריים טובים";
  return "ערב טוב";
}

function updateGreeting() {
  const titleEl = document.getElementById("greetingTitle");
  const subtitleEl = document.getElementById("greetingSubtitle");
  if (!titleEl || !subtitleEl) return;

  const baseGreeting = getTimeOfDayGreeting();
  const name = (userSettings.firstName || "").trim();

  if (name) {
    titleEl.textContent = `${baseGreeting}, ${name}!`;
    subtitleEl.textContent = "כיף לראות אותך שוב במעקב.";
  } else {
    titleEl.textContent = `${baseGreeting}!`;
    subtitleEl.textContent = "המסע הבריא שלך מתחיל כאן";
  }
}

function populateSettingsForm() {
  const firstNameInput = document.getElementById("settingsFirstName");
  const heightInput = document.getElementById("settingsHeightCm");
  const weighInSelect = document.getElementById("settingsWeighInDay");
  const profilePicInput = document.getElementById("profilePicInput"); // <--- הוספנו את השדה של התמונה

  if (!firstNameInput || !heightInput || !weighInSelect) return;

  firstNameInput.value = userSettings.firstName || "";
  heightInput.value = userSettings.heightCm || "";
  weighInSelect.value =
    userSettings.weighInDay !== null ? String(userSettings.weighInDay) : "";

  // <--- הוספנו את טעינת הלינק לתוך השדה
  if (profilePicInput) {
    profilePicInput.value = userSettings.profilePicUrl || "";
  }
}

function openSettingsModal() {
  populateSettingsForm();
  const modal = document.getElementById("settingsModal");
  if (modal) modal.classList.remove("hidden");
}

function closeSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (modal) modal.classList.add("hidden");
}

// ----- METRICS CALCULATION -----

// Latest known weight (kg). If limitDateStr is provided (YYYY-MM-DD),
// only considers entries on or before that date.
function getLatestWeightUpToDate(limitDateStr) {
  const hasLimit = !!limitDateStr;
  let latestWeight = null;
  let latestDate = null;

  entries.forEach((entry) => {
    if (typeof entry.weight !== "number" || isNaN(entry.weight)) return;
    if (hasLimit && entry.date > limitDateStr) return;
    if (!latestDate || entry.date > latestDate) {
      latestDate = entry.date;
      latestWeight = entry.weight;
    }
  });

  return latestWeight;
}

// MET value by activity type (Hebrew labels)
function getMetForActivity(activityType) {
  switch (activityType) {
    case "הליכה":
      return 4.0;
    case "ריצה":
      return 10.0;
    case "רכיבה":
      return 8.0;
    case "חדר כושר":
    case "אחר":
    default:
      return 5.0;
  }
}

// Calories = MET * weight(kg) * (durationMinutes / 60)
function calculateEntryCalories(entry) {
  const duration =
    typeof entry.durationMinutes === "number" && !isNaN(entry.durationMinutes)
      ? entry.durationMinutes
      : null;
  if (!duration || duration <= 0) return null;

  let weightToUse =
    typeof entry.weight === "number" && !isNaN(entry.weight)
      ? entry.weight
      : getLatestWeightUpToDate(entry.date);

  if (!weightToUse || isNaN(weightToUse) || weightToUse <= 0) return null;

  const met = getMetForActivity(entry.activityType || "");
  const calories = met * weightToUse * (duration / 60);
  return calories > 0 ? calories : null;
}

// Total calories burned in the last 7 days (including today)
function calculateCaloriesThisWeek() {
  if (!entries.length) return 0;

  const today = dateFromYMD(getTodayDateString());
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);

  let total = 0;

  entries.forEach((entry) => {
    const d = dateFromYMD(entry.date);
    if (d < sevenDaysAgo || d > today) return;
    const cals = calculateEntryCalories(entry);
    if (typeof cals === "number" && !isNaN(cals)) {
      total += cals;
    }
  });

  return total;
}

function refreshDashboardSummary() {
  const currentWeightElement = document.getElementById("currentWeightDisplay");
  const totalLossElement = document.getElementById("totalLossDisplay");
  const entriesWeekElement = document.getElementById("entriesWeekDisplay");
  const streakElement = document.getElementById("streakDisplay");
  const caloriesWeekElement = document.getElementById("caloriesWeekDisplay");

  if (
    !currentWeightElement ||
    !totalLossElement ||
    !entriesWeekElement ||
    !streakElement ||
    !caloriesWeekElement
  )
    return;

  if (!entries.length) {
    currentWeightElement.textContent = "—";
    totalLossElement.textContent = "—";
    entriesWeekElement.textContent = "0";
    streakElement.textContent = "0";
    caloriesWeekElement.textContent = "0";
    return;
  }

  // Use only entries with valid weight for weight metrics
  const entriesWithWeight = entries.filter(
    (e) => typeof e.weight === "number" && !isNaN(e.weight),
  );

  if (!entriesWithWeight.length) {
    currentWeightElement.textContent = "—";
    totalLossElement.textContent = "—";
  } else {
    const sortedByDate = [...entriesWithWeight].sort(
      (a, b) => dateFromYMD(a.date) - dateFromYMD(b.date),
    );
    const earliest = sortedByDate[0];
    const latest = sortedByDate[sortedByDate.length - 1];

    currentWeightElement.textContent = latest.weight.toFixed(1);

    const diff = earliest.weight - latest.weight;
    totalLossElement.textContent = diff.toFixed(1);
  }

  // Entries this week (any log)
  const today = dateFromYMD(getTodayDateString());
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);

  const entriesThisWeek = entries.filter((entry) => {
    const d = dateFromYMD(entry.date);
    return d >= sevenDaysAgo && d <= today;
  });
  entriesWeekElement.textContent = entriesThisWeek.length.toString();

  // Streak
  const streak = calculateCurrentStreak();
  streakElement.textContent = String(streak);

  // Calories this week
  const caloriesWeek = calculateCaloriesThisWeek();
  caloriesWeekElement.textContent = caloriesWeek.toFixed(0);
}

function calculateCurrentStreak() {
  if (!entries.length) return 0;

  // Create a set of unique dates
  const uniqueDates = new Set(entries.map((e) => e.date));
  const sortedDatesDesc = Array.from(uniqueDates).sort(
    (a, b) => dateFromYMD(b) - dateFromYMD(a),
  );

  let streak = 0;
  // Logic: Check today, if exists -> streak++. If not, check yesterday.
  // Actually, standard streak logic usually allows missing "today" if you logged "yesterday".

  const todayStr = getTodayDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDateToYMD(yesterday);

  let currentCheckDate = uniqueDates.has(todayStr) ? new Date() : yesterday;
  // If neither today nor yesterday has an entry, streak is broken/0 (unless we strictly count from most recent log)

  // Let's count backwards from the most recent log, but if the most recent log is older than yesterday, streak is 0.
  const mostRecentLogDate = sortedDatesDesc[0]; // String YYYY-MM-DD
  const mostRecentDateObj = dateFromYMD(mostRecentLogDate);
  const diffTime = Math.abs(new Date() - mostRecentDateObj);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (mostRecentLogDate !== todayStr && mostRecentLogDate !== yesterdayStr) {
    return 0;
  }

  // Start counting
  streak = 1;
  let cursor = dateFromYMD(mostRecentLogDate);

  while (true) {
    cursor.setDate(cursor.getDate() - 1);
    const prevStr = formatDateToYMD(cursor);
    if (uniqueDates.has(prevStr)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function calculateCurrentBmi() {
  if (!entries.length) return null;
  if (
    !userSettings ||
    typeof userSettings.heightCm !== "number" ||
    isNaN(userSettings.heightCm) ||
    userSettings.heightCm <= 0
  ) {
    return null;
  }

  const entriesWithWeight = entries.filter(
    (e) => typeof e.weight === "number" && !isNaN(e.weight),
  );
  if (!entriesWithWeight.length) return null;

  const sortedByDate = [...entriesWithWeight].sort(
    (a, b) => dateFromYMD(a.date) - dateFromYMD(b.date),
  );
  const latest = sortedByDate[sortedByDate.length - 1];

  const heightM = userSettings.heightCm / 100;
  const bmi = latest.weight / (heightM * heightM);

  let category = "";
  if (bmi < 18.5) category = "תת־משקל";
  else if (bmi < 25) category = "טווח תקין";
  else if (bmi < 30) category = "עודף משקל";
  else category = "השמנה";

  return { value: bmi, category };
}

function refreshBmiDisplay() {
  const bmiValueEl = document.getElementById("bmiDisplay");
  const bmiCategoryEl = document.getElementById("bmiCategoryDisplay");
  const bmiCard = document.getElementById("bmiCard");
  if (!bmiValueEl || !bmiCategoryEl || !bmiCard) return;

  const result = calculateCurrentBmi();

  // Reset dynamic background
  bmiCard.classList.remove(
    "bg-yellow-100",
    "bg-green-100",
    "bg-orange-100",
    "bg-red-100",
  );

  if (!result) {
    bmiValueEl.textContent = "—";
    if (
      userSettings &&
      typeof userSettings.heightCm === "number" &&
      !isNaN(userSettings.heightCm) &&
      userSettings.heightCm > 0
    ) {
      bmiCategoryEl.textContent = "הזן/י משקל לחישוב BMI";
    } else {
      bmiCategoryEl.textContent = "הגדר/י גובה בהגדרות לחישוב BMI";
    }
    return;
  }

  bmiValueEl.textContent = result.value.toFixed(1);
  bmiCategoryEl.textContent = result.category;

  const bmi = result.value;
  if (bmi < 18.5) {
    bmiCard.classList.add("bg-yellow-100");
  } else if (bmi < 25) {
    bmiCard.classList.add("bg-green-100");
  } else if (bmi < 30) {
    bmiCard.classList.add("bg-orange-100");
  } else {
    bmiCard.classList.add("bg-red-100");
  }
}

// ----- HISTORY TABLE -----

function refreshHistoryTable() {
  const tbody = document.getElementById("historyTableBody");
  const countLabel = document.getElementById("historyCountLabel");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!entries.length) {
    if (countLabel) countLabel.textContent = "אין רשומות";
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-slate-400 text-xs">אין נתונים עדיין</td></tr>`;
    return;
  }

  // Sort Descending (Newest first)
  const sorted = [...entries].sort(
    (a, b) => dateFromYMD(b.date) - dateFromYMD(a.date),
  );

  sorted.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 border-b border-slate-100 last:border-0";

    const dateTd = document.createElement("td");
    dateTd.className = "py-3 px-3 text-right text-slate-700";
    dateTd.textContent = entry.date;

    const weightTd = document.createElement("td");
    weightTd.className = "py-3 px-3 text-right font-medium text-slate-800";
    if (typeof entry.weight === "number" && !isNaN(entry.weight)) {
      weightTd.textContent = `${entry.weight.toFixed(1)} ק"ג`;
    } else {
      weightTd.textContent = "—";
    }

    const activityTd = document.createElement("td");
    activityTd.className = "py-3 px-3 text-right text-slate-500 text-sm";
    activityTd.textContent = entry.activityType || "—";

    const caloriesTd = document.createElement("td");
    caloriesTd.className = "py-3 px-3 text-right text-slate-600 text-sm";
    const cals = calculateEntryCalories(entry);
    caloriesTd.textContent =
      typeof cals === "number" && !isNaN(cals) ? `${cals.toFixed(0)}` : "—";

    const notesTd = document.createElement("td");
    notesTd.className = "py-3 px-3 text-right text-slate-500 text-sm";
    const note = (entry.notes || "").trim();
    if (note) {
      const infoBtn = document.createElement("button");
      infoBtn.className =
        "text-sky-500 hover:text-sky-700 p-1 rounded-full hover:bg-sky-50";
      infoBtn.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
      infoBtn.title = "הצגת הערה";
      infoBtn.onclick = () => {
        alert(note);
      };
      notesTd.appendChild(infoBtn);
    } else {
      notesTd.textContent = "—";
    }

    const actionTd = document.createElement("td");
    actionTd.className = "py-3 px-2 text-center";

    // Delete Button
    const deleteBtn = document.createElement("button");
    deleteBtn.className =
      "text-rose-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-full transition";
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    deleteBtn.title = "מחק רשומה";
    deleteBtn.onclick = () => deleteEntry(entry);

    actionTd.appendChild(deleteBtn);

    tr.appendChild(dateTd);
    tr.appendChild(weightTd);
    tr.appendChild(activityTd);
    tr.appendChild(caloriesTd);
    tr.appendChild(notesTd);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });

  if (countLabel) countLabel.textContent = `${entries.length} רשומות`;
}

function deleteEntry(entryToDelete) {
  if (!confirm("האם למחוק את הרשומה מתאריך " + entryToDelete.date + "?"))
    return;

  // Filter out the exact entry
  entries = entries.filter((e) => e !== entryToDelete);
  saveEntries(entries);
  refreshAllUI();
}

// ----- CHART -----

function initChart() {
  const ctx = document.getElementById("weightChart");
  if (!ctx) return;

  weightChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "משקל",
          data: [],
          borderColor: "#10b981", // Emerald 500
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          borderWidth: 2,
          tension: 0.3,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#10b981",
          pointRadius: 4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { border: { dash: [4, 4] }, ticks: { font: { size: 10 } } },
      },
    },
  });
}

function refreshChart() {
  if (!weightChart) return;

  // Only plot entries that have a valid weight
  const entriesWithWeight = entries.filter(
    (e) => typeof e.weight === "number" && !isNaN(e.weight),
  );

  if (!entriesWithWeight.length) {
    weightChart.data.labels = [];
    weightChart.data.datasets[0].data = [];
    weightChart.update();
    return;
  }

  // Chart needs Oldest -> Newest
  const sorted = [...entriesWithWeight].sort(
    (a, b) => dateFromYMD(a.date) - dateFromYMD(b.date),
  );

  weightChart.data.labels = sorted.map((e) => e.date.slice(5)); // Show only MM-DD
  weightChart.data.datasets[0].data = sorted.map((e) => e.weight);
  weightChart.update();
}

// ----- MOTIVATION & NOTIFICATIONS -----

function getMotivationalQuotes() {
  // Try to use external data.js if exists, else fallback
  if (
    typeof window.motivationalQuotes !== "undefined" &&
    Array.isArray(window.motivationalQuotes)
  ) {
    return window.motivationalQuotes;
  }
  return [
    "הצעד הראשון הוא תמיד הקשה ביותר.",
    "התמדה היא המפתח להצלחה.",
    "אל תוותר על מה שאתה רוצה ביותר בשביל מה שאתה רוצה עכשיו.",
    "הגוף שלך מסוגל להכל. זה המוח שצריך שכנוע.",
    "כל יום הוא הזדמנות חדשה.",
    "תאמין בעצמך וביכולות שלך.",
  ];
}

function refreshMotivation() {
  const el = document.getElementById("motivationText");
  if (!el) return;
  const quotes = getMotivationalQuotes();
  const random = quotes[Math.floor(Math.random() * quotes.length)];
  el.textContent = random;

  // Optional: Return quote for notification
  return random;
}

// Check for permission and send notifications
async function checkAndSendNotifications() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  // 1. Daily Weigh-in Reminder
  const todayStr = getTodayDateString();
  if (!hasEntryOnDate(todayStr)) {
    // Check if it's the specific weigh-in day
    const todayDay = new Date().getDay(); // 0=Sun, 6=Sat
    if (userSettings.weighInDay === todayDay) {
      new Notification(
        `היי ${userSettings.firstName || ""}, היום יום השקילה שלך!`,
        {
          body: "אל תשכח לעלות על המשקל ולעדכן.",
          icon: "favicon.ico",
        },
      );
    }
  }

  // 2. Missed Weigh-in (Yesterday)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDay = yesterday.getDay();
  const yesterdayStr = formatDateToYMD(yesterday);

  if (
    userSettings.weighInDay === yesterdayDay &&
    !hasEntryOnDate(yesterdayStr)
  ) {
    // Don't spam if they already logged today
    if (!hasEntryOnDate(todayStr)) {
      new Notification("פספסת שקילה אתמול", {
        body: "לא נורא, אפשר להישקל ולעדכן גם היום!",
      });
    }
  }
}

function updateNotificationsStatus() {
  const el = document.getElementById("notificationsStatus");
  if (!el) return;

  if (!("Notification" in window)) {
    el.textContent = "דפדפן זה לא תומך בהתראות";
    return;
  }

  if (Notification.permission === "granted") {
    el.textContent = "התראות פעילות ✅";
    el.className = "text-xs text-emerald-600 mt-1";
  } else if (Notification.permission === "denied") {
    el.textContent = "התראות חסומות ❌";
    el.className = "text-xs text-rose-500 mt-1";
  } else {
    el.textContent = "לחץ להפעלת התראות";
  }
}

// ----- IMPORT / EXPORT LOGIC (FIXED) -----

// Smart export helper: try Web Share API with files, fall back to download.
// Smart Export: Share -> Download -> Clipboard Fallback
async function smartExport(blob, fileName, title) {
  try {
    // --- נסיון 1: שיתוף (הכי נוח בטלפון) ---
    const file = new File([blob], fileName, { type: blob.type });

    // בודקים אם הדפדפן תומך בשיתוף קבצים
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: title,
          text: "הנה קובץ הנתונים שלך",
        });
        return; // הצליח! עוצרים כאן.
      } catch (shareError) {
        console.warn(
          "Share failed or cancelled, trying download...",
          shareError,
        );
        // אם השיתוף נכשל (או שהמשתמש ביטל), ממשיכים לנסיון הבא
      }
    }

    // --- נסיון 2: הורדה (Data URI שעוקף חלק מהחסימות) ---
    // ממירים את הקובץ לטקסט base64
    const reader = new FileReader();

    reader.onload = function (e) {
      try {
        const dataUrl = e.target.result;

        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = fileName;
        a.style.display = "none";
        document.body.appendChild(a);

        // לחיצה וירטואלית
        a.click();

        // ניקוי
        setTimeout(() => document.body.removeChild(a), 1000);
      } catch (downloadError) {
        // אם ההורדה נכשלה (למשל חסימת אבטחה קשה) - מפעילים את תוכנית החירום
        console.error(
          "Download failed, using clipboard fallback",
          downloadError,
        );
        fallbackToClipboard(blob);
      }
    };

    // טיפול בשגיאות קריאה של הקובץ עצמו
    reader.onerror = function () {
      fallbackToClipboard(blob);
    };

    reader.readAsDataURL(blob);
  } catch (globalError) {
    // --- נסיון 3 (רשת ביטחון): העתקה ללוח ---
    console.error("Critical error, falling back to clipboard", globalError);
    fallbackToClipboard(blob);
  }
}

// פונקציית העזר למקרה חירום (העתקה + הוראות)
async function fallbackToClipboard(blob) {
  try {
    const textData = await blob.text();
    await navigator.clipboard.writeText(textData);

    alert(
      "בגלל מגבלות אבטחה בטלפון, ההורדה האוטומטית נכשלה.\n\n" +
        "✅ אבל הנתונים הועתקו ללוח בהצלחה!\n\n" +
        "כדי לשמור אותם:\n" +
        "1. פתח את הוואטסאפ או המייל.\n" +
        "2. עשה 'הדבק' (Paste).\n" +
        "3. שלח לעצמך את ההודעה.",
    );
  } catch (err) {
    alert(
      "מצטערים, הטלפון חוסם גם העתקה אוטומטית. נסה להשתמש בכפתורי ההעתקה הידניים.",
    );
  }
}

// Export Full JSON (Settings + Logs)
async function exportFullBackupJson() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    userSettings: userSettings,
    logs: entries,
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const fileName = `גיבוי_דיאטה_${getFormattedDateForFile()}.json`; // <-- תוקן
  await smartExport(blob, fileName, "גיבוי מלא - יומן תזונה וכושר");
}

// Export CSV (Logs only)
async function exportToCsv() {
  if (!entries.length) {
    alert("אין נתונים לייצוא");
    return;
  }

  const header = [
    "Date",
    "Weight (kg)",
    "Activity",
    "Duration (min)",
    "Calories",
    "Notes",
  ];

  const rows = entries.map((e) => {
    const note = (e.notes || "").replace(/"/g, '""');
    const weightOut =
      typeof e.weight === "number" && !isNaN(e.weight) ? e.weight : "";
    const duration = e.duration || 0;
    const calories = e.calories || 0;
    return `${e.date},${weightOut},${e.activityType},${duration},${calories},"${note}"`;
  });

  const csvContent = "\uFEFF" + [header.join(","), ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const fileName = `אקסל_דיאטה_${getFormattedDateForFile()}.csv`; // <-- תוקן

  await smartExport(blob, fileName, "ייצוא רישומי פעילות ל‑CSV");
}

// Export CSV (Logs only)
async function exportToCsv() {
  if (!entries.length) {
    alert("אין נתונים לייצוא");
    return;
  }

  // הוספנו כאן את העמודות החדשות: זמן (דקות) וקלוריות
  const header = [
    "Date",
    "Weight (kg)",
    "Activity",
    "Duration (min)",
    "Calories",
    "Notes",
  ];

  const rows = entries.map((e) => {
    // Escape quotes
    const note = (e.notes || "").replace(/"/g, '""');
    const weightOut =
      typeof e.weight === "number" && !isNaN(e.weight) ? e.weight : "";

    // שליפת הנתונים החדשים (אם אין, נכתוב 0)
    const duration = e.duration || 0;
    const calories = e.calories || 0;

    return `${e.date},${weightOut},${e.activityType},${duration},${calories},"${note}"`;
  });

  const csvContent = "\uFEFF" + [header.join(","), ...rows].join("\n"); // Add BOM for Hebrew Excel
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const fileName = `DietTracker_Log_${getTodayDateString()}.csv`;

  // הקריאה לפונקציה החכמה שתפתח את תפריט השיתוף בטלפון
  await smartExport(blob, fileName, "ייצוא רישומי פעילות ל‑CSV");
}

// Restore Logic (The Fix)
function restoreFullBackupJsonFromText(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    alert("שגיאה: קובץ הגיבוי אינו קובץ JSON תקין.");
    return;
  }

  // 1. עדכון הגדרות (Settings)
  if (parsed.userSettings) {
    userSettings = parsed.userSettings;
    saveSettings(userSettings);
  }

  // 2. עדכון רשומות (Logs) - התיקון הקריטי
  if (Array.isArray(parsed.logs)) {
    // שימוש במפה כדי למזג נתונים ולמנוע דריסה של הכל פרט לאחרון
    const logsMap = new Map();

    // הכנסת נתונים קיימים
    entries.forEach((e) => logsMap.set(e.date, e));

    // הוספת הנתונים מהגיבוי (דורס רק אם התאריך זהה)
    parsed.logs.forEach((inLog) => {
      if (!inLog || !inLog.date) return;

      let weightNum = null;
      if (typeof inLog.weight === "number") {
        weightNum = inLog.weight;
      } else if (
        typeof inLog.weight === "string" &&
        inLog.weight.trim() !== ""
      ) {
        const parsedWeight = parseFloat(inLog.weight);
        if (!isNaN(parsedWeight)) weightNum = parsedWeight;
      }

      let durationMinutes = null;
      if (typeof inLog.durationMinutes === "number") {
        durationMinutes = inLog.durationMinutes;
      } else if (
        typeof inLog.durationMinutes === "string" &&
        inLog.durationMinutes.trim() !== ""
      ) {
        const d = parseInt(inLog.durationMinutes.trim(), 10);
        if (!isNaN(d)) durationMinutes = d;
      }

      logsMap.set(inLog.date, {
        date: inLog.date,
        weight: weightNum,
        activityType: inLog.activityType || "",
        notes: inLog.notes || "",
        durationMinutes,
      });
    });

    // עדכון המשתנה הגלובלי entries מהמפה הממוזגת
    entries = Array.from(logsMap.values());

    // מיון מהחדש לישן
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    // שמירה סופית של המערך המלא
    saveEntries(entries);
  }

  alert(`השחזור הושלם! המערכת כוללת כעת ${entries.length} רשומות.`);
  refreshAllUI();
}

// ----- MAIN REFRESH CONTROLLER -----

// ----- MAIN REFRESH CONTROLLER -----

function refreshAllUI() {
  updateGreeting();
  refreshDashboardSummary();
  refreshHistoryTable();
  refreshChart();
  refreshBmiDisplay();
  updateNotificationsStatus();

  if (typeof updateProfilePic === "function") {
    updateProfilePic();
  }
}

// ----- EVENT LISTENERS (INIT) -----

document.addEventListener("DOMContentLoaded", () => {
  // Init Components
  initChart();
  const dateInput = document.getElementById("dateInput");
  if (dateInput) dateInput.value = getTodayDateString();

  refreshMotivation();
  refreshAllUI();

  // Notifications Check on Load
  setTimeout(checkAndSendNotifications, 2000);

  // --- NAVIGATION ---
  document.querySelectorAll(".nav-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-target");

      // Toggle Views
      document
        .querySelectorAll("[id^='view-']")
        .forEach((el) => el.classList.add("hidden"));
      document.getElementById(target).classList.remove("hidden");

      // Toggle Buttons
      document.querySelectorAll(".nav-button").forEach((b) => {
        b.classList.remove("text-emerald-600", "font-semibold");
        b.classList.add("text-slate-500");
      });
      btn.classList.remove("text-slate-500");
      btn.classList.add("text-emerald-600", "font-semibold");
    });
  });

  // --- FORMS ---

  // Quick Entry
  const entryForm = document.getElementById("entryForm");
  if (entryForm) {
    entryForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const weightInput = document.getElementById("weightInput");
      const durationInput = document.getElementById("durationInput");

      const weightRaw = weightInput ? weightInput.value.trim() : "";
      const hasWeight = weightRaw !== "";
      let weightVal = hasWeight ? parseFloat(weightRaw) : null;

      if (hasWeight && (!weightVal || isNaN(weightVal) || weightVal <= 0)) {
        alert("נא להזין משקל תקין או להשאיר ריק.");
        return;
      }

      const dateVal =
        document.getElementById("dateInput").value || getTodayDateString();
      const activityVal = document.getElementById("activityType").value;
      const notesVal = document.getElementById("notesInput").value;

      // Optional duration
      let durationMinutes = null;
      if (durationInput && durationInput.value.trim() !== "") {
        const d = parseInt(durationInput.value.trim(), 10);
        if (!isNaN(d) && d > 0) {
          durationMinutes = d;
        }
      }

      // If no weight provided, fall back to latest known weight
      if (!hasWeight) {
        const latest = getLatestWeightUpToDate(dateVal);
        weightVal =
          typeof latest === "number" && !isNaN(latest) ? latest : null;
      }

      // Add/Update Logic
      const newEntry = {
        date: dateVal,
        weight: weightVal,
        activityType: activityVal,
        notes: notesVal,
        durationMinutes,
      };

      // Remove existing entry for same date if exists (replace)
      entries = entries.filter((e) => e.date !== dateVal);
      entries.push(newEntry);

      saveEntries(entries);
      refreshAllUI();

      // Reset form
      if (weightInput) weightInput.value = "";
      if (durationInput) durationInput.value = "";
      document.getElementById("notesInput").value = "";
      alert("נשמר בהצלחה! 🔥");

      // Go to History? Or stay.
      refreshChart(); // update chart immediately
    });
  }

  // Toggle show/hide entry form
  const toggleFormBtn = document.getElementById("toggleFormButton");
  const entryFormCard = document.getElementById("entryFormCard");
  if (toggleFormBtn && entryFormCard) {
    toggleFormBtn.addEventListener("click", () => {
      const isHidden = entryFormCard.classList.toggle("hidden");
      const icon = toggleFormBtn.querySelector("i");
      const label = toggleFormBtn.querySelector("span");
      if (icon) {
        icon.className =
          "fa-solid " +
          (isHidden
            ? "fa-chevron-down text-[10px]"
            : "fa-chevron-up text-[10px]");
      }
      if (label) {
        label.textContent = isHidden ? "הצג טופס רישום" : "הסתר טופס רישום";
      }
    });
  }

  // Settings Save
  const settingsForm = document.getElementById("settingsForm");
  if (settingsForm) {
    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();

      userSettings.firstName =
        document.getElementById("settingsFirstName").value;
      userSettings.heightCm = Number(
        document.getElementById("settingsHeightCm").value,
      );

      const wDay = document.getElementById("settingsWeighInDay").value;
      userSettings.weighInDay = wDay !== "" ? Number(wDay) : null; // --- התוספת לתמונת הפרופיל ---

      const profilePicInput = document.getElementById("profilePicInput");
      if (profilePicInput) {
        userSettings.profilePicUrl = profilePicInput.value.trim();
      }

      saveSettings(userSettings);
      refreshAllUI();
      if (typeof updateProfilePic === "function") updateProfilePic(); // טעינת התמונה מיד
      closeSettingsModal();
      alert("הגדרות נשמרו");
    });
  }

  // --- MODALS ---
  const openSettingsBtn = document.getElementById("openSettingsModalButton");
  if (openSettingsBtn) openSettingsBtn.onclick = openSettingsModal;

  const closeSettingsBtn = document.getElementById("closeSettingsModalButton");
  if (closeSettingsBtn) closeSettingsBtn.onclick = closeSettingsModal;

  // --- ACTIONS ---

  // Notification Request
  const notifBtn = document.getElementById("notificationsButton");
  if (notifBtn) {
    notifBtn.onclick = () => {
      Notification.requestPermission().then(refreshAllUI);
    };
  }

  // Clear Data
  const clearBtn = document.getElementById("clearDataButton");
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm("בטוח למחוק הכל? אין דרך חזרה.")) {
        entries = [];
        userSettings = { firstName: "", heightCm: null, weighInDay: null };
        saveEntries(entries);
        saveSettings(userSettings);
        refreshAllUI();
      }
    };
  }

  // Export JSON
  const dlBackupBtn = document.getElementById("downloadBackupJsonButton");
  if (dlBackupBtn) dlBackupBtn.onclick = exportFullBackupJson;

  // Export CSV
  const expCsvBtn = document.getElementById("exportCsvButton");
  if (expCsvBtn) expCsvBtn.onclick = exportToCsv;

  // Import JSON
  const restoreBtn = document.getElementById("restoreBackupJsonButton");
  const restoreInput = document.getElementById("restoreBackupJsonInput");

  if (restoreBtn && restoreInput) {
    restoreBtn.onclick = () => restoreInput.click();

    restoreInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => restoreFullBackupJsonFromText(evt.target.result);
      reader.readAsText(file);
      // reset value to allow same file select again
      restoreInput.value = "";
    };
  }
});
// --- פונקציות העתקה ללוח (Clipboard) ---

// העתקת ה-CSV ללוח
async function copyCsvToClipboard() {
  if (!entries.length) return alert("אין נתונים להעתקה");

  // בניית ה-CSV בזיכרון
  const header = [
    "Date",
    "Weight (kg)",
    "Activity",
    "Duration",
    "Calories",
    "Notes",
  ];
  const rows = entries.map((e) => {
    const note = (e.notes || "").replace(/"/g, '""');
    return `${e.date},${e.weight || ""},${e.activityType},${e.duration || 0},${e.calories || 0},"${note}"`;
  });
  const csvText = [header.join(","), ...rows].join("\n");

  try {
    await navigator.clipboard.writeText(csvText);
    alert("הנתונים הועתקו ללוח! אפשר להדביק בוואטסאפ.");
  } catch (err) {
    alert("שגיאה בהעתקה. נסה שוב.");
  }
}

// העתקת הגיבוי המלא (JSON) ללוח
async function copyBackupToClipboard() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    logs: entries,
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    alert("קוד הגיבוי הועתק! שמור אותו במקום בטוח.");
  } catch (err) {
    alert("שגיאה בהעתקה.");
  }
}
// --- קסם: יצירת תזכורת ביומן הטלפון ---
function addToCalendar() {
  // הגדרת הפרטים
  const title = encodeURIComponent("🏃 תזכורת: יומן מעקב דיאטה");
  const details = encodeURIComponent(
    "הזמן היומי שלך למלא משקל ופעילות באפליקציה! היכנס לקישור.",
  );

  // זמנים (מתחיל מהיום ב-20:00 עד 20:15)
  const now = new Date();
  now.setHours(20, 0, 0, 0);
  const start = now.toISOString().replace(/-|:|\.\d\d\d/g, ""); // פורמט מיוחד לגוגל
  const end = new Date(now.getTime() + 15 * 60000)
    .toISOString()
    .replace(/-|:|\.\d\d\d/g, "");

  // יצירת הקישור הישיר לגוגל קלנדר
  const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${start}/${end}&recur=RRULE:FREQ=DAILY`;

  // פתיחה בחלון חדש (הדפדפן של ה-QIN יפתח את זה כאתר רגיל)
  window.open(googleCalUrl, "_blank");
}
// --- פונקציות עזר חדשות ---

// 1. יצירת תאריך בפורמט DD-MM-YY לשמות קבצים
function getFormattedDateForFile() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

// 2. שחזור מגיבוי על ידי הדבקת טקסט
function restoreFromText() {
  const jsonText = prompt("הדבק כאן את קוד הגיבוי (JSON) שהעתקת:");
  if (!jsonText) return;

  try {
    const parsedData = JSON.parse(jsonText);
    if (parsedData && parsedData.logs) {
      // קריאה לפונקציית המיזוג החכמה שכבר קיימת בקוד
      restoreFullBackupJsonFromText(jsonText);
      if (typeof updateProfilePic === "function") updateProfilePic();
    } else {
      alert("הטקסט שהודבק לא נראה כמו קובץ גיבוי תקין.");
    }
  } catch (e) {
    alert(
      "שגיאה בפענוח הטקסט. וודא שהעתקת את הגיבוי במלואו (ללא תוספות מסביב).",
    );
    console.error(e);
  }
}

// 3. עדכון תמונת הפרופיל בראש הדף
function updateProfilePic() {
  const container = document.getElementById("userProfileIconContainer");
  if (!container) return;

  if (userSettings.profilePicUrl && userSettings.profilePicUrl.trim() !== "") {
    // אם יש לינק, נשים תמונה. ה-onerror מוודא שאם הלינק שבור, זה חוזר לאייקון.
    container.innerHTML = `<img src="${userSettings.profilePicUrl}" class="h-full w-full object-cover" alt="Profile" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-user text-xl\\'></i>';"/>`;
  } else {
    // אם אין, נחזיר את האייקון הרגיל
    container.innerHTML = `<i class="fa-solid fa-user text-xl"></i>`;
  }
}
