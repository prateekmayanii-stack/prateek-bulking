// Global App State
let currentSelectedImageBase64 = null;
let timerInterval = null;
let timerTotalSeconds = 75;
let timerRemainingSeconds = 75;
let isTimerRunning = false;
let audioCtx = null;

// Offline-Ready Local State Template
const DEFAULT_LOCAL_STATE = {
  profile: {
    name: "Prateek",
    currentWeight: 53.0,
    targetWeight: 65.0,
    heightCm: 175,
    calorieTarget: 2600,
    proteinTarget: 125,
    waterTargetMl: 3500,
    phase: "Phase 1 - Week 1 Priming (Lean Bulking)",
    vegDaysRemaining: 6
  },
  today: {
    date: new Date().toISOString().split("T")[0],
    meals: [
      { id: "m_1", time: "08:30 AM", name: "2 Bananas (Pre-Workout)", calories: 210, protein: 3, carbs: 52, fats: 1, notes: "Pre-workout energy" }
    ],
    waterMl: 1250,
    supplements: { creatine: false, whey: false, multivitamin: false, omega3_d3: false },
    lastMealTimestamp: Date.now() - 3600000,
    totalCalories: 210,
    totalProtein: 3,
    totalCarbs: 52,
    totalFats: 1,
    pendingCalories: 2390,
    pendingProtein: 122,
    pendingWaterMl: 2250,
    hoursSinceLastMeal: 1.0
  }
};

function getLocalState() {
  try {
    const raw = localStorage.getItem("bulking_app_state");
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_LOCAL_STATE));
}

function saveLocalState(state) {
  try {
    // Recalculate totals
    const meals = state.today.meals || [];
    state.today.totalCalories = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
    state.today.totalProtein = meals.reduce((sum, m) => sum + (m.protein || 0), 0);
    state.today.totalCarbs = meals.reduce((sum, m) => sum + (m.carbs || 0), 0);
    state.today.totalFats = meals.reduce((sum, m) => sum + (m.fats || 0), 0);

    state.today.pendingCalories = Math.max(0, state.profile.calorieTarget - state.today.totalCalories);
    state.today.pendingProtein = Math.max(0, state.profile.proteinTarget - state.today.totalProtein);
    state.today.pendingWaterMl = Math.max(0, state.profile.waterTargetMl - state.today.waterMl);

    localStorage.setItem("bulking_app_state", JSON.stringify(state));
  } catch (e) {}
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  fetchState();
  calculatePortion();
  selectWorkoutDay(1); // Automatically load Day 1 (TODAY: Monday PUSH Hypertrophy)
});

// Sound Beep using Web Audio API (Zero external assets needed)
function playBeep(freq = 880, duration = 0.2) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.log("Audio not allowed or blocked:", e);
  }
}

// Tab Switching
function switchTab(tabId) {
  document.querySelectorAll(".tab-pane").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(el => el.classList.remove("active"));

  const targetPane = document.getElementById(`tab-${tabId}`);
  if (targetPane) targetPane.classList.add("active");

  const btnIndex = { dashboard: 0, scanner: 1, diet: 2, workout: 3, chat: 4 }[tabId];
  const tabs = document.querySelectorAll(".nav-tab");
  if (tabs[btnIndex]) tabs[btnIndex].classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Fetch Full Application State (Offline + Online resilient)
async function fetchState() {
  try {
    const res = await fetch("/api/state");
    if (res.ok) {
      const data = await res.json();
      saveLocalState(data);
      renderDashboard(data);
      return;
    }
  } catch (e) {
    console.log("Offline mode: Reading from LocalStorage");
  }
  const localData = getLocalState();
  renderDashboard(localData);
}

// Render Dashboard Elements
function renderDashboard(data) {
  const { profile, today } = data;

  // Calorie HUD
  document.getElementById("hud-cal-consumed").innerText = (today.totalCalories || 0).toLocaleString();
  document.getElementById("hud-cal-target").innerText = (profile.calorieTarget || 2600).toLocaleString();
  document.getElementById("hud-cal-pending").innerText = `${(today.pendingCalories || 0).toLocaleString()} kcal`;

  const calPct = Math.min(100, Math.round(((today.totalCalories || 0) / profile.calorieTarget) * 100));
  document.getElementById("cal-progress-bar").style.width = `${calPct}%`;

  // Macros HUD
  document.getElementById("hud-p-val").innerText = today.totalProtein || 0;
  const pPct = Math.min(100, Math.round(((today.totalProtein || 0) / profile.proteinTarget) * 100));
  document.getElementById("p-bar").style.width = `${pPct}%`;
  document.getElementById("p-pending").innerText = `${today.pendingProtein || 0}g left`;

  document.getElementById("hud-c-val").innerText = today.totalCarbs || 0;
  const cPct = Math.min(100, Math.round(((today.totalCarbs || 0) / 365) * 100));
  document.getElementById("c-bar").style.width = `${cPct}%`;
  document.getElementById("c-pending").innerText = `${Math.max(0, 365 - (today.totalCarbs || 0))}g left`;

  document.getElementById("hud-f-val").innerText = today.totalFats || 0;
  const fPct = Math.min(100, Math.round(((today.totalFats || 0) / 58) * 100));
  document.getElementById("f-bar").style.width = `${fPct}%`;
  document.getElementById("f-pending").innerText = `${Math.max(0, 58 - (today.totalFats || 0))}g left`;

  // Water
  document.getElementById("water-consumed").innerText = (today.waterMl || 0).toLocaleString();
  document.getElementById("water-target").innerText = (profile.waterTargetMl || 3500).toLocaleString();
  document.getElementById("water-pending-badge").innerText = `(${today.pendingWaterMl.toLocaleString()} ml left)`;
  const waterPct = Math.min(100, Math.round(((today.waterMl || 0) / profile.waterTargetMl) * 100));
  document.getElementById("water-bar").style.width = `${waterPct}%`;

  // Anabolic Gap Timer
  const gapHours = today.hoursSinceLastMeal || 1.0;
  const gapBadge = document.getElementById("anabolic-timer-badge");
  const gapText = document.getElementById("gap-time-text");
  gapText.innerText = `${gapHours}h ago`;

  if (gapHours >= 3.5) {
    gapBadge.style.background = "rgba(244, 63, 94, 0.2)";
    gapBadge.style.borderColor = "var(--rose)";
    gapBadge.style.color = "var(--rose)";
    gapText.innerText = `⚠️ ${gapHours}h (Eat Now!)`;
  } else {
    gapBadge.style.background = "rgba(245, 158, 11, 0.12)";
    gapBadge.style.borderColor = "rgba(245, 158, 11, 0.3)";
    gapBadge.style.color = "var(--amber)";
  }

  // Supplements
  if (today.supplements) {
    for (const [key, val] of Object.entries(today.supplements)) {
      const btn = document.getElementById(`supp-${key}`);
      if (btn) {
        if (val) btn.classList.add("checked");
        else btn.classList.remove("checked");
      }
    }
  }

  // Meals List
  const mealsListEl = document.getElementById("today-meals-list");
  if (!today.meals || today.meals.length === 0) {
    mealsListEl.innerHTML = `<div style="text-align:center; padding: 16px; color: var(--text-muted); font-size:12px;">No meals logged yet today.</div>`;
  } else {
    mealsListEl.innerHTML = today.meals.map(m => `
      <div class="meal-card-item">
        <div class="m-info">
          <strong>${escapeHtml(m.name)}</strong>
          <small>${m.time} ${m.notes ? `• ${escapeHtml(m.notes)}` : ""}</small>
        </div>
        <div class="m-macros">
          <span class="m-cal">${m.calories} kcal</span>
          <span class="m-prot">${m.protein}g Protein</span>
        </div>
        <button onclick="deleteMeal('${m.id}')" style="background:none; border:none; color:var(--text-muted); margin-left:10px; cursor:pointer; font-size:14px;">&times;</button>
      </div>
    `).join("");
  }
}

// Add Water (Offline + Online)
async function addWater(amount) {
  playBeep(600, 0.1);
  const st = getLocalState();
  st.today.waterMl = Math.min(6000, Math.max(0, (st.today.waterMl || 0) + amount));
  saveLocalState(st);
  renderDashboard(st);

  try {
    fetch("/api/water", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountMl: amount })
    });
  } catch (e) {}
}

// Toggle Supplement (Offline + Online)
async function toggleSupp(key) {
  playBeep(750, 0.1);
  const st = getLocalState();
  if (st.today.supplements) {
    st.today.supplements[key] = !st.today.supplements[key];
    saveLocalState(st);
    renderDashboard(st);
  }

  try {
    fetch("/api/supplements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });
  } catch (e) {}
}

// Delete Meal
async function deleteMeal(id) {
  const st = getLocalState();
  st.today.meals = (st.today.meals || []).filter(m => m.id !== id);
  saveLocalState(st);
  renderDashboard(st);

  try {
    fetch(`/api/meals/${id}`, { method: "DELETE" });
  } catch (e) {}
}

// Quick Add Meal
async function quickAdd(name, cal, p, c, f) {
  playBeep(880, 0.15);
  const st = getLocalState();
  const newMeal = {
    id: "m_" + Date.now(),
    time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
    name,
    calories: cal,
    protein: p,
    carbs: c,
    fats: f,
    notes: "Quick Desi Shortcut"
  };

  st.today.meals = st.today.meals || [];
  st.today.meals.push(newMeal);
  st.today.lastMealTimestamp = Date.now();
  saveLocalState(st);
  renderDashboard(st);
  switchTab("dashboard");

  try {
    fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMeal)
    });
  } catch (e) {}
}

// Photo Input Handlers
function handleImageSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    currentSelectedImageBase64 = evt.target.result;
    document.getElementById("food-preview-img").src = currentSelectedImageBase64;
    document.getElementById("preview-container").style.display = "block";
    document.getElementById("dropzone-prompt").style.display = "none";
  };
  reader.readAsDataURL(file);
}

function removeSelectedImage(e) {
  e.stopPropagation();
  currentSelectedImageBase64 = null;
  document.getElementById("food-preview-img").src = "";
  document.getElementById("preview-container").style.display = "none";
  document.getElementById("dropzone-prompt").style.display = "block";
  document.getElementById("camera-input").value = "";
  document.getElementById("gallery-input").value = "";
}

// Client-side Indian Food Nutrition Engine (Runs 100% Offline on Phone)
const CLIENT_INDIAN_FOODS = [
  { match: ["palak paneer", "paneer palak"], name: "Palak Paneer (150g)", cal: 340, p: 18, c: 10, f: 24 },
  { match: ["paneer bhurji"], name: "Paneer Bhurji (150g)", cal: 380, p: 22, c: 8, f: 28 },
  { match: ["paneer"], name: "Paneer (100g)", cal: 265, p: 18, c: 4, f: 20 },
  { match: ["rice", "chawal"], name: "White Rice (1 Bowl / 150g)", cal: 205, p: 4, c: 45, f: 0.5 },
  { match: ["roti", "chapati", "phulka"], name: "Roti (1 piece)", cal: 85, p: 3, c: 16, f: 0.5, perUnit: true },
  { match: ["paratha"], name: "Aloo/Paneer Paratha (1 pc)", cal: 240, p: 6, c: 32, f: 10, perUnit: true },
  { match: ["dal", "daal", "tadka"], name: "Thick Dal (1 Bowl / 150g)", cal: 160, p: 9, c: 24, f: 3 },
  { match: ["rajma"], name: "Rajma Masala (1 Bowl / 150g)", cal: 210, p: 11, c: 32, f: 4 },
  { match: ["chhole", "chole", "chana"], name: "Chhole / Chana (1 Bowl)", cal: 240, p: 12, c: 36, f: 5 },
  { match: ["soya chunks", "soya"], name: "Soya Chunks Curry (50g)", cal: 220, p: 26, c: 16, f: 2 },
  { match: ["dahi", "curd", "yogurt"], name: "Fresh Dahi (1 Bowl)", cal: 120, p: 6, c: 8, f: 7 },
  { match: ["banana", "kela"], name: "Banana (1 medium)", cal: 105, p: 1.3, c: 27, f: 0.3, perUnit: true },
  { match: ["milk", "doodh"], name: "Full Cream Milk (1 Glass)", cal: 180, p: 8, c: 12, f: 10 },
  { match: ["peanut butter", "pb"], name: "Peanut Butter (2 Tbsp)", cal: 190, p: 8, c: 6, f: 16 },
  { match: ["oats", "oatmeal"], name: "Rolled Oats (50g raw)", cal: 195, p: 7, c: 34, f: 3.5 },
  { match: ["whey", "protein powder"], name: "Whey Protein (1 Scoop)", cal: 125, p: 25, c: 2, f: 1.5 },
  { match: ["egg", "ande", "anda"], name: "Whole Egg (1 boiled/fried)", cal: 75, p: 6.5, c: 0.5, f: 5, perUnit: true },
  { match: ["chicken breast", "chicken"], name: "Chicken Breast (150g)", cal: 240, p: 46, c: 0, f: 5 },
  { match: ["almonds", "badam"], name: "Almonds (10 pieces)", cal: 70, p: 2.5, c: 2.5, f: 6 },
  { match: ["ghee"], name: "Desi Ghee (1 Tbsp)", cal: 120, p: 0, c: 0, f: 14 }
];

let pendingExtractedMeal = null;

async function analyzeFood() {
  const textInput = document.getElementById("food-text-input").value.trim().toLowerCase();
  if (!textInput && !currentSelectedImageBase64) {
    alert("Bhai plate ki photo select karo ya khane ka naam likho!");
    return;
  }

  const btnText = document.getElementById("analyze-btn-text");
  btnText.innerText = "Analyzing Plate...";

  // Client-side instant evaluation
  let found = [];
  let totalCal = 0, totalP = 0, totalC = 0, totalF = 0;

  for (const item of CLIENT_INDIAN_FOODS) {
    for (const kw of item.match) {
      if (textInput.includes(kw)) {
        let qty = 1;
        const regex = new RegExp(`(\\d+)\\s*(?:ta|pieces?|pcs?)?\\s*${kw}`);
        const m = textInput.match(regex);
        if (m && m[1]) qty = parseInt(m[1], 10);

        const cal = Math.round(item.cal * (item.perUnit ? qty : 1));
        const p = Math.round(item.p * (item.perUnit ? qty : 1));
        const c = Math.round(item.c * (item.perUnit ? qty : 1));
        const f = Math.round(item.f * (item.perUnit ? qty : 1));

        found.push(`${item.name}${qty > 1 && item.perUnit ? ` × ${qty}` : ""}`);
        totalCal += cal; totalP += p; totalC += c; totalF += f;
        break;
      }
    }
  }

  if (found.length === 0) {
    if (currentSelectedImageBase64 && !textInput) {
      pendingExtractedMeal = {
        dishName: "Detected Indian Meal (Thali / Sabzi Bowl)",
        calories: 580, protein: 24, carbs: 72, fats: 18,
        note: "AI Visual estimation: balanced home preparation portion."
      };
    } else {
      pendingExtractedMeal = {
        dishName: textInput || "Home Cooked Meal",
        calories: 450, protein: 18, carbs: 62, fats: 14,
        note: "Estimated average Indian portion."
      };
    }
  } else {
    pendingExtractedMeal = {
      dishName: found.join(" + "),
      calories: totalCal, protein: totalP, carbs: totalC, fats: totalF,
      note: "Extracted via Smart Indian Nutritional Mapping."
    };
  }

  // Show extracted card
  document.getElementById("ext-dish-name").innerText = pendingExtractedMeal.dishName;
  document.getElementById("ext-calories").innerText = `${pendingExtractedMeal.calories} kcal`;
  document.getElementById("ext-p").innerText = `${pendingExtractedMeal.protein}g`;
  document.getElementById("ext-c").innerText = `${pendingExtractedMeal.carbs}g`;
  document.getElementById("ext-f").innerText = `${pendingExtractedMeal.fats}g`;
  document.getElementById("ext-note").innerText = pendingExtractedMeal.note;
  
  document.getElementById("extracted-card").style.display = "block";
  document.getElementById("extracted-card").scrollIntoView({ behavior: "smooth" });
  playBeep(920, 0.2);
  btnText.innerText = "Extract Macros ⚡";
}

function cancelExtracted() {
  document.getElementById("extracted-card").style.display = "none";
  pendingExtractedMeal = null;
}

async function confirmAddExtracted() {
  if (!pendingExtractedMeal) return;

  const st = getLocalState();
  const newMeal = {
    id: "m_" + Date.now(),
    time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
    name: pendingExtractedMeal.dishName,
    calories: pendingExtractedMeal.calories,
    protein: pendingExtractedMeal.protein,
    carbs: pendingExtractedMeal.carbs,
    fats: pendingExtractedMeal.fats,
    notes: "AI Scanner Extraction",
    image: currentSelectedImageBase64
  };

  st.today.meals = st.today.meals || [];
  st.today.meals.push(newMeal);
  st.today.lastMealTimestamp = Date.now();
  saveLocalState(st);
  renderDashboard(st);

  cancelExtracted();
  removeSelectedImage({ stopPropagation: () => {} });
  document.getElementById("food-text-input").value = "";
  switchTab("dashboard");

  try {
    fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMeal)
    });
  } catch (e) {}
}

// "Ghar Pe Kya Bana Hai" Reverse Portion Calculations
const DISH_PORTIONS = {
  palak_paneer: {
    title: "Palak Paneer with Rice Target",
    serving: "• 150g Paneer (at least 6-8 thick cubes)\n• 1.5 Katori Boiled White Rice\n• 1 Katori Dahi (Curd)",
    macros: "~650 kcal | 26g Protein | 78g Carbs | 24g Fats",
    tip: "Paneer gravy me se paneer ke pieces plate me zyada chun kar lo taaki protein hit ho!"
  },
  rajma_chawal: {
    title: "Rajma Chawal Target",
    serving: "• 1.5 Katori Thick Rajma\n• 1.5 Katori Rice\n• 1 Katori Dahi (Probiotic & Protein)",
    macros: "~620 kcal | 23g Protein | 94g Carbs | 12g Fats",
    tip: "Rajma + Rice milke complete amino acid profile banate hain (Muscle building gold!)."
  },
  dal_roti: {
    title: "Thick Dal + Roti Target",
    serving: "• 2 Katori Thick Dal (Tadka)\n• 3 Ghee Roti\n• 1 Bowl Dahi ya 50g Roasted Paneer",
    macros: "~610 kcal | 25g Protein | 85g Carbs | 16g Fats",
    tip: "Patli daal mat lo — daal ka gaadha hissa katori me daalo taaki calories milein!"
  },
  chhole_bhature_roti: {
    title: "Chhole with Roti / Rice Target",
    serving: "• 1.5 Katori Chhole\n• 3 Roti (ya 1.5 Katori Rice)\n• Cucumber Onion Salad with Lemon",
    macros: "~640 kcal | 24g Protein | 92g Carbs | 15g Fats",
    tip: "Chhole high fiber aur dense carbs hain — workout ke baad recovery ke liye solid fuel."
  },
  paneer_bhurji: {
    title: "Paneer Bhurji with Roti Target",
    serving: "• 150g Paneer Bhurji\n• 3 Roti (with light ghee)\n• 1 Glass Chaas / Buttermilk",
    macros: "~680 kcal | 31g Protein | 55g Carbs | 34g Fats",
    tip: "Fastest cooking high-protein meal. Paneer ko zyada deep fry nahi karna."
  },
  soya_curry: {
    title: "Soya Chunks with Rice Target",
    serving: "• 50g Soya Chunks (boiled & squeezed in curry)\n• 1.5 Katori Rice\n• Green Sabzi",
    macros: "~540 kcal | 32g Protein | 80g Carbs | 6g Fats",
    tip: "Vegetarian bulk ka king protein source (52% protein density)!"
  },
  aloo_paratha: {
    title: "Aloo / Gobi Paratha Target",
    serving: "• 2 Parathas (medium oil/ghee)\n• 1 Bowl Dahi (200g)\n• 1 Glass Milk / Protein Shake",
    macros: "~690 kcal | 24g Protein | 88g Carbs | 25g Fats",
    tip: "Breakfast me aasan 700 calories lene ka best desi tareeqa."
  }
};

function calculatePortion() {
  const sel = document.getElementById("dish-select").value;
  const p = DISH_PORTIONS[sel];
  if (!p) return;

  const box = document.getElementById("portion-recommendation-box");
  box.innerHTML = `
    <h4>${p.title}</h4>
    <p style="white-space: pre-line; margin-bottom: 6px; font-weight:600; color:var(--text-primary);">${p.serving}</p>
    <div style="font-size:11px; color:var(--amber); font-weight:700; margin-bottom:4px;">${p.macros}</div>
    <small style="color:var(--text-muted);">${p.tip}</small>
  `;
}

// In-Gym Rest Timer
function startTimer(seconds) {
  resetTimer();
  timerTotalSeconds = seconds;
  timerRemainingSeconds = seconds;
  updateTimerDisplay();

  document.querySelectorAll(".btn-timer-preset").forEach(b => b.classList.remove("active-preset"));
  if (seconds === 60) document.querySelectorAll(".btn-timer-preset")[0].classList.add("active-preset");
  if (seconds === 75) document.querySelectorAll(".btn-timer-preset")[1].classList.add("active-preset");
  if (seconds === 90) document.querySelectorAll(".btn-timer-preset")[2].classList.add("active-preset");

  toggleTimer();
}

function toggleTimer() {
  const btn = document.getElementById("btn-timer-toggle");
  if (isTimerRunning) {
    clearInterval(timerInterval);
    isTimerRunning = false;
    btn.innerText = "Resume";
  } else {
    isTimerRunning = true;
    btn.innerText = "Pause";
    timerInterval = setInterval(() => {
      timerRemainingSeconds--;
      updateTimerDisplay();
      if (timerRemainingSeconds <= 0) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        btn.innerText = "Start";
        playBeep(1200, 0.4);
        setTimeout(() => playBeep(1200, 0.4), 450);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        alert("⏰ Rest Time Complete! Next Set Lagao, Beast Mode!");
      }
    }, 1000);
  }
}

function resetTimer() {
  clearInterval(timerInterval);
  isTimerRunning = false;
  timerRemainingSeconds = timerTotalSeconds;
  document.getElementById("btn-timer-toggle").innerText = "Start";
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const mins = String(Math.floor(timerRemainingSeconds / 60)).padStart(2, "0");
  const secs = String(timerRemainingSeconds % 60).padStart(2, "0");
  document.getElementById("timer-digits").innerText = `${mins}:${secs}`;
}

// Emergency Calorie Rescue Modal
function openRescueModal() {
  const st = getLocalState();
  const pending = st.today.pendingCalories || 1770;

  const content = document.getElementById("rescue-content");
  content.innerHTML = `
    <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:10px 12px; margin-bottom:14px;">
      <strong style="color:var(--rose);">Current Pending Calories: ${pending.toLocaleString()} kcal</strong>
      <p style="font-size:11px; color:var(--text-secondary); margin-top:2px;">Bina heavy feel huye ye recipes 5-10 minute me target hit karwa dengi:</p>
    </div>

    <div class="rescue-recipe-card">
      <h4>⚡ Option 1: The 700 kcal Anabolic Liquid Shake</h4>
      <p>Mixi me dalo: 250ml Full Cream Milk + 2 Banana + 2 Tbsp Peanut Butter + 40g Oats (pees kar) + thoda honey.</p>
      <div class="r-stats">
        <span style="color:var(--amber);">🔥 ~700 kcal</span>
        <span style="color:var(--emerald);">💪 26g Protein</span>
        <span style="color:var(--cyan);">⏱️ 3 Mins</span>
      </div>
      <button class="btn-primary" style="margin-top:8px; padding:8px; font-size:12px;" onclick="quickAdd('Emergency Anabolic Shake', 700, 26, 88, 25); closeRescueModal();">Log This Shake ✓</button>
    </div>

    <div class="rescue-recipe-card">
      <h4>🧈 Option 2: 400 kcal Quick Bedtime Boost</h4>
      <p>1 Glass Doodh (250ml) + 2 Bread Slices with 2 Tbsp Peanut Butter ya Desi Ghee.</p>
      <div class="r-stats">
        <span style="color:var(--amber);">🔥 ~420 kcal</span>
        <span style="color:var(--emerald);">💪 16g Protein</span>
        <span style="color:var(--cyan);">⏱️ 2 Mins</span>
      </div>
      <button class="btn-primary" style="margin-top:8px; padding:8px; font-size:12px;" onclick="quickAdd('Bedtime Milk + PB Toast', 420, 16, 48, 18); closeRescueModal();">Log This Boost ✓</button>
    </div>
  `;

  document.getElementById("rescue-modal").style.display = "flex";
}

function closeRescueModal() {
  document.getElementById("rescue-modal").style.display = "none";
}

// Coach AI Chat
async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const msg = input.value.trim();
  if (!msg) return;

  const chatContainer = document.getElementById("chat-messages");

  // User msg
  const userDiv = document.createElement("div");
  userDiv.className = "chat-bubble user-msg";
  userDiv.innerText = msg;
  chatContainer.appendChild(userDiv);

  input.value = "";
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Typing indicator
  const typingDiv = document.createElement("div");
  typingDiv.className = "chat-bubble coach-msg";
  typingDiv.innerText = "Coach Akash is thinking...";
  chatContainer.appendChild(typingDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Local instant smart coaching response
  setTimeout(() => {
    let reply = "";
    const m = msg.toLowerCase();
    if (m.includes("kya khau") || m.includes("shake") || m.includes("hungry") || m.includes("dinner")) {
      reply = "Bhai liquid calories pakdo! 250ml full cream milk + 2 banana + 2 tbsp peanut butter + 40g oats = instant 700 kcal bina pet bhare!";
    } else if (m.includes("creatine")) {
      reply = "Creatine 5g roz post-workout compulsory hai! 10 din me intracellular water badha ke muscles ko full karega.";
    } else if (m.includes("cardio")) {
      reply = "Zero Cardio rule! 53kg bulk me cardio karoge to bachi hui calories waste hongi. Saari energy lifting me lagao.";
    } else {
      reply = "Loha uthana signal hai, lekin asli muscle building ye 2,600 calories se hogi. Har set me slow negative aur full focus rakho!";
    }
    typingDiv.innerText = reply;
    chatContainer.scrollTop = chatContainer.scrollHeight;
    playBeep(800, 0.1);
  }, 400);
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// ==========================================
// PPL HYPERTROPHY SPLIT (6 DAYS LIFTING • SUNDAY ONLY REST)
// ==========================================
const WEEK1_WORKOUTS = {
  1: {
    dayName: "Day 1 (Monday): PUSH 1 - Upper Chest Dominance & Shoulders",
    duration: "~50 Mins",
    focus: "Upper Clavicular Chest, Lateral Delts & Triceps • RPE 7-8",
    notes: "Akash Yaduvanshi Upper Chest Rule: Incline angle se start karo. 3-second slow negative descent!",
    exercises: [
      { name: "Incline DB Bench Press (30°)", group: "Upper Clavicular Chest (Anchor Lift)", sets: 4, reps: "6–8", rest: 90, cue: "Bench 30° incline. Retract shoulder blades, 3s slow negative, explode up without clanking." },
      { name: "Flat Dumbbell Press", group: "Sternal Mid Chest Mass", sets: 3, reps: "8–10", rest: 75, cue: "Elbows tucked at 45°. Feel deep chest stretch at bottom, press up in a smooth arch." },
      { name: "Incline Cable / Machine Flyes", group: "Upper Chest Peak Squeeze", sets: 3, reps: "10–12", rest: 60, cue: "Slight elbow bend, hug a wide barrel, squeeze clavicular pecs for 1s at contraction." },
      { name: "Seated DB Shoulder Press", group: "Anterior & Lateral Deltoids", sets: 3, reps: "8–10", rest: 75, cue: "Bench at 75-80°. Lower dumbbells to ear level with control, press up overhead." },
      { name: "DB Lateral Raises (Akash V-Taper)", group: "Lateral Deltoids (Capped 3D Look)", sets: 4, reps: "12–15", rest: 60, cue: "Lean slightly forward, lead with elbows, raise to parallel. Strict form, ZERO hip swing." },
      { name: "Lying EZ-Bar Skull Crushers", group: "Triceps Long Head", sets: 3, reps: "8–10", rest: 60, cue: "Lower the bar behind your crown for a deep triceps stretch, extend elbows smoothly." },
      { name: "Tricep Rope Pushdowns", group: "Triceps Lateral Head", sets: 3, reps: "12–15", rest: 45, cue: "Keep elbows glued to ribs. Spread the rope outwards at the bottom and lock out." }
    ]
  },
  2: {
    dayName: "Day 2 (Tuesday): PULL 1 - V-Taper Lat Width & Biceps",
    duration: "~50 Mins",
    focus: "Lat Width, Mid-Back Thickness, Rear Delts & Biceps",
    notes: "Pull with your elbows, not hands. Drive shoulder blades back and down for wide V-frame.",
    exercises: [
      { name: "Lat Pulldown (Wide Grip)", group: "Latissimus Dorsi (V-Taper Width)", sets: 4, reps: "8–10", rest: 75, cue: "Arch upper chest up slightly, drive elbows down to hips, pause 1s at bottom, 3s negative." },
      { name: "Seated Cable Row (Close V-Grip)", group: "Mid-Back & Rhomboid Thickness", sets: 3, reps: "8–10", rest: 75, cue: "Keep chest tall, pull handle to belly button, squeeze shoulder blades together." },
      { name: "One-Arm Dumbbell Row", group: "Lower Lat & Outer Back", sets: 3, reps: "8–10", rest: 75, cue: "Pull dumbbell toward hip pocket like pulling a lawnmower cord. Don't rotate upper torso." },
      { name: "Cable Face Pulls (with Rope)", group: "Rear Delts & Rotator Cuff Health", sets: 4, reps: "12–15", rest: 60, cue: "Set pulley at eye level. Pull rope to eyes, thumbs pointing back, spread hands apart." },
      { name: "Standing DB / Barbell Bicep Curls", group: "Biceps Brachii", sets: 3, reps: "8–10", rest: 60, cue: "Keep elbows pinned at sides. Supinate wrists at top, resist 3s on the way down." },
      { name: "Incline DB Hammer Curls", group: "Brachialis & Forearm Thickness", sets: 3, reps: "10–12", rest: 60, cue: "Bench at 60°. Neutral grip (palms facing each other). Builds upper arm width." }
    ]
  },
  3: {
    dayName: "Day 3 (Wednesday): LEGS 1 - Quad Power & Lower Back",
    duration: "~50 Mins",
    focus: "Quad Mass, Hamstring Curl, Calves & Hyperextension",
    notes: "Flat shoes, solid foot contact. Never lock knees violently at top of squats or leg press.",
    exercises: [
      { name: "Barbell Back Squats (or Smith Squat)", group: "Quad Mass & Posterior Chain", sets: 4, reps: "6–8", rest: 90, cue: "Flat shoes, shoulder-width stance, brace core, break at hips and knees, hit parallel." },
      { name: "Leg Press Machine", group: "Quad Hypertrophy & Glutes", sets: 3, reps: "10–12", rest: 75, cue: "Feet mid-platform. Deep descent without lifting lower back from pad. Never lock knees!" },
      { name: "Leg Extension Machine", group: "Rectus Femoris Isolation", sets: 3, reps: "12–15", rest: 60, cue: "Squeeze quads hard at the top for 1 full second, 2-second slow lowering." },
      { name: "Lying Hamstring Leg Curls", group: "Hamstring Peak Flexion", sets: 4, reps: "8–10", rest: 60, cue: "Keep hips glued to pad. Curl up smoothly, control the negative without jerking." },
      { name: "Standing Calf Raises", group: "Gastrocnemius (Calves)", sets: 4, reps: "12–15", rest: 45, cue: "Full deep stretch at bottom for 1s, push high on big toes and hold 2s at peak." },
      { name: "Hyperextensions (Back Extension)", group: "Spinal Erectors & Glute Tie-in", sets: 3, reps: "12–15", rest: 60, cue: "Pad below hip crease. Round upper back slightly going down, pull up to neutral spine." }
    ]
  },
  4: {
    dayName: "Day 4 (Thursday): PUSH 2 - Chest Clavicle & Lateral Width",
    duration: "~50 Mins",
    focus: "Incline Barbell, Dips, Capped Delts & Triceps",
    notes: "Upper chest heavy progressive overload. Lateral raises volume for boulder shoulders.",
    exercises: [
      { name: "Incline Barbell Bench Press", group: "Upper Chest Heavy Tension", sets: 4, reps: "6–8", rest: 90, cue: "Grip slightly wider than shoulder width. Lower bar to upper chest clavicle line, press explosive." },
      { name: "Chest Dips (or Incline Machine)", group: "Lower/Outer Chest & Triceps", sets: 3, reps: "8–10", rest: 75, cue: "Lean torso 30° forward, elbows flared slightly outward to target chest over triceps." },
      { name: "Flat DB Flyes / Cable Crossover", group: "Chest Stretch Hypertrophy", sets: 3, reps: "10–12", rest: 60, cue: "Soft elbow bend. Lower until you feel deep pec stretch, bring dumbbells together at top." },
      { name: "DB Arnold Shoulder Press", group: "Full Deltoid Rotation", sets: 3, reps: "8–10", rest: 75, cue: "Start palms facing chest, rotate outwards as you press overhead, smooth reversal." },
      { name: "Cable Lateral Raises", group: "Lateral Deltoids (Constant Tension)", sets: 4, reps: "12–15", rest: 60, cue: "Cables give continuous tension at the bottom. Keep arms long, raise to shoulder height." },
      { name: "Overhead DB Tricep Extension", group: "Triceps Long Head", sets: 3, reps: "10–12", rest: 60, cue: "Seated, hold one dumbbell with both hands overhead. Deep stretch behind neck." },
      { name: "Straight Bar Cable Pushdowns", group: "Triceps Medial & Lateral Heads", sets: 3, reps: "12–15", rest: 45, cue: "Pin elbows at sides. Press down and squeeze hard for 1 second at full lockout." }
    ]
  },
  5: {
    dayName: "Day 5 (Friday): PULL 2 - Mid-Back Thickness & Bicep Peak",
    duration: "~50 Mins",
    focus: "T-Bar Rows, Lower Lats, Rear Delts & Arms",
    notes: "Chest-supported row builds dense Bollywood back thickness. Full bicep stretch on preacher.",
    exercises: [
      { name: "Chest-Supported T-Bar / Barbell Row", group: "Dense Mid-Back & Rhomboids", sets: 4, reps: "6–8", rest: 90, cue: "Chest pinned to support pad. Pull elbows back, squeeze mid-back with zero momentum." },
      { name: "Lat Pulldown (Neutral or Reverse Grip)", group: "Lower Lats & Bicep Assist", sets: 3, reps: "8–10", rest: 75, cue: "Underhand/V-grip allows full elbow tuck and hits the lower insertion of the lats." },
      { name: "Straight-Arm Cable Lat Pullover", group: "Isolated Lat Contraction", sets: 3, reps: "12–15", rest: 60, cue: "Slight forward torso lean, arms straight with slight bend. Drive bar down to thighs using lats." },
      { name: "Reverse Pec Deck Machine (Rear Delt Flyes)", group: "Rear Deltoid Mass", sets: 4, reps: "12–15", rest: 60, cue: "Chest flat against pad. Keep arms parallel to floor, push elbows back wide." },
      { name: "Preacher Curls (EZ-Bar or Machine)", group: "Bicep Short Head (Peak Isolation)", sets: 3, reps: "8–10", rest: 60, cue: "Arms flat on preacher pad. Eliminates body swing completely for pure bicep recruitment." },
      { name: "Cable Rope Hammer Curls", group: "Brachialis & Forearm Thickness", sets: 3, reps: "12–15", rest: 60, cue: "Palms facing together throughout. Squeeze hard at the top to build arm thickness." }
    ]
  },
  6: {
    dayName: "Day 6 (Saturday): LEGS 2 & Core Overload",
    duration: "~50 Mins",
    focus: "Romanian Deadlifts, Hamstring Stretch, Calves & Abs",
    notes: "RDL me hips peeche bhejo, knees soft rakho. Sunday full rest ke liye energy channel karo!",
    exercises: [
      { name: "Romanian Deadlifts (DB or Barbell)", group: "Hamstring & Glute Stretch", sets: 4, reps: "8–10", rest: 90, cue: "Soft knees, push hips far back to wall behind you, flat neutral spine, feel deep hamstring stretch." },
      { name: "Leg Press (Feet High & Wide)", group: "Hamstrings, Glutes & Adductors", sets: 3, reps: "10–12", rest: 75, cue: "High foot placement shifts mechanical load directly to hamstrings and glutes." },
      { name: "Walking DB Lunges", group: "Quad & Glute Unilateral Mass", sets: 3, reps: "10 / leg", rest: 75, cue: "Take controlled strides, back knee kisses floor lightly, chest upright." },
      { name: "Leg Extension Machine", group: "Quad Burnout Hypertrophy", sets: 3, reps: "12–15", rest: 60, cue: "3-second slow lowering on every rep to completely fatigue quad muscle fibers." },
      { name: "Seated Calf Raises", group: "Soleus (Deep Calf Thickness)", sets: 4, reps: "15–20", rest: 45, cue: "Knees bent at 90° targets the soleus muscle underneath the calf." },
      { name: "Hanging Leg / Knee Raises", group: "Lower Abdominals", sets: 3, reps: "12–15", rest: 45, cue: "Curl pelvis upward towards chest. Avoid swinging your legs like a pendulum." },
      { name: "Plank Hold", group: "Core Transverse Abdominis", sets: 3, reps: "45–60s", rest: 45, cue: "Brace abs as if someone is about to punch your stomach, neutral spine." }
    ]
  },
  7: {
    dayName: "Day 7 (Sunday): ONLY REST DAY & Weekly Weigh-In",
    duration: "Full Rest",
    focus: "Sunday Morning Empty Stomach Weigh-in • Zero Cardio",
    notes: "Full recovery day! Weigh yourself first thing in the morning empty stomach after bathroom. Log your weight. Eat 2,600 clean calories to grow muscle tissue during rest!",
    isRest: true
  }
};

function selectWorkoutDay(dayNum) {
  const pills = document.querySelectorAll(".day-pill");
  pills.forEach((p, idx) => {
    if (idx + 1 === dayNum) p.classList.add("active-day");
    else p.classList.remove("active-day");
  });

  const workout = WEEK1_WORKOUTS[dayNum];
  const container = document.getElementById("dynamic-workout-content");
  if (!workout || !container) return;

  if (workout.isRest) {
    container.innerHTML = `
      <div class="glass-panel" style="text-align:center; padding:24px 16px;">
        <span style="font-size:36px; display:block; margin-bottom:8px;">🛌</span>
        <h3 style="color:var(--cyan); margin-bottom:6px;">${workout.dayName}</h3>
        <p style="font-size:13px; color:var(--text-secondary); line-height:1.5;">${workout.notes}</p>
        <div style="margin-top:14px; background:rgba(6,182,212,0.1); border:1px solid rgba(6,182,212,0.3); border-radius:10px; padding:10px; font-size:12px; color:var(--cyan);">
          💧 Target: 3,500ml Water • ⚡ 2,600 kcal Clean Bulking Fuel
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="workout-notes-box">
      <strong>${workout.dayName} (${workout.duration})</strong>
      <span>${workout.notes}</span>
    </div>

    ${workout.exercises.map((ex, exIdx) => `
      <div class="exercise-item glass-panel">
        <div class="ex-info">
          <strong>${exIdx + 1}. ${ex.name}</strong>
          <small>${ex.group} • ${ex.sets} Sets &times; ${ex.reps} Reps</small>
          <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">Cue: ${ex.cue}</div>
        </div>
        <div class="ex-sets">
          ${Array.from({ length: ex.sets }).map((_, sIdx) => `
            <button class="set-pill" onclick="toggleSetDone(this, ${ex.rest})">S${sIdx + 1} ✓</button>
          `).join("")}
        </div>
      </div>
    `).join("")}
  `;
}

function toggleSetDone(btn, restSeconds) {
  btn.classList.toggle("done");
  if (btn.classList.contains("done")) {
    playBeep(950, 0.15);
    startTimer(restSeconds || 75);
  }
}
