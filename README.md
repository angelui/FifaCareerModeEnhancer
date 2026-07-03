# FIFA Career Narrative Companion

An offline, desktop sidecar application for FIFA/FC Career Mode (supporting FIFA 15 through FIFA 20). 

> **Note:** You play the game yourself on your console or PC; this app does not read or modify your game save files. Instead, it acts as a rich narrative and tactical companion to run your career mode with deep intention, structure, and immersion.

---

## 🌟 Key Features

### 1. 📋 Start Your Career (Setup)
Choose the FIFA edition (15–20) and the club you are managing. You can create custom career profiles per club to keep your progress and customizations isolated.

### 2. 🏛️ Club Archive
Browse how clubs and squads evolved across different FIFA editions. Compare squad size, average ratings, Best XI OVR, age distribution, and national identity (top nationalities) across FIFA 15 through FIFA 20.

### 3. 🎲 Random Selection (New!)
Feeling undecided? Use the Random Selection tool to:
- **Generate a Random Club:** Instantly get a complete tactical breakdown of a random club, including their Best XI OVR, squad nationality breakdown, top 3 key players, top 2 young prospects (under 23), and top 2 senior leaders. You can inspect their history or select them to start your career immediately!
- **Generate a Random Player:** Discover random players with full ratings, potentials, financial values, wages, and beautifully rendered interactive attribute graphs (outfield stats or goalkeeper stats).

### 4. 🛡️ Club Context
Get auto-generated club philosophies, transfer budget guidelines, and era-specific narratives tailored to your squad's current data.

### 5. 🎯 Objectives & Matches
Track board objectives and key fixtures. The app dynamically highlights important matches based on local rivalries and geographic distance (nearest clubs in km).

### 6. 🔍 Roster Tools & Signing Suggestions
Search the database of players and find realistic transfer targets:
- **Ex-Players:** Players who used to play for your club in earlier editions.
- **Future Stars:** Players who signed for your club in later real-life editions (e.g., if you play FIFA 15, a player who signed for your club in FIFA 18 will appear as a suggestion).
- **Budget-Friendly Signings:** Filter suggestions based on value and wage limits.

### 7. 📖 Career Narrative (Journal)
Keep a season-by-season journal of your career mode. Document your storylines, player arcs, trophy wins, and long-term save direction.

---

## 🛠️ Installation & Setup

To run the FIFA Career Narrative Companion, you need to start both the **FastAPI Backend** (Python) and the **Vite Frontend** (Node.js).

### 📋 Prerequisites
- **Python 3.10+**
- **Node.js 18+**

---

### 1. Backend Setup (FastAPI)

From the project root directory, open a terminal (Git Bash is recommended) and run:

```bash
# 1. Create the virtual environment (first time only)
python -m venv .venv

# 2. Activate the virtual environment in Git Bash
source .venv/Scripts/activate
# (On Windows PowerShell, use: .\.venv\Scripts\Activate.ps1)

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Start the FastAPI backend
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend API will be running at `http://127.0.0.1:8000`.

---

### 2. Frontend Setup (Vite)

Open a **second terminal** (PowerShell or Command Prompt), navigate to the `frontend` directory, and run:

```powershell
# 1. Navigate to the frontend directory
cd frontend

# 2. Install Node dependencies (first time or if package.json changes)
npm install

# 3. Start the Vite development server
npm run dev
```

The frontend web UI will be running at `http://localhost:5173`.

---

## 🚀 How to Use

1. Ensure both the **Backend** and **Frontend** servers are running.
2. Open your web browser and navigate to: **[http://localhost:5173](http://localhost:5173)**
3. On your first visit, the app will display a **bootstrap loading screen** to preload all FIFA 15–20 CSV datasets into the backend cache. Once all editions are preloaded (green checkmarks), you are ready to go!
4. Go to **Start your Career** to pick your FIFA edition and club, or explore the **Club Archive** and **Random Selection** tabs.

---

## 📂 Project Structure

```text
├── backend/                  # Python FastAPI Backend
│   ├── app/
│   │   ├── main.py           # API routes & server entrypoint
│   │   ├── data.py           # Pandas data loading & processing logic
│   │   ├── config.py         # App configuration & path helpers
│   │   └── ...
├── data/                     # FIFA 15-20 CSV datasets & coordinates
├── frontend/                 # Vite + Vanilla JS Frontend
│   ├── public/
│   │   └── config/app.json   # Frontend configuration
│   ├── src/
│   │   ├── views/            # UI Views (setup, home, club-archive, etc.)
│   │   ├── ui/               # Reusable UI components (combobox, loader)
│   │   ├── router.js         # Client-side router
│   │   ├── styles.css        # Global CSS styling
│   │   └── main.js           # Frontend entrypoint
├── requirements.txt          # Python dependencies
└── README.md                 # This file
```

---

## 🛡️ Privacy & Philosophy

- **100% Offline-First:** All player databases, coordinates, and club details are stored locally in the `data/` folder. No data ever leaves your machine.
- **Save Integrity:** The app operates completely independently from your console or PC game files, ensuring zero risk of save corruption.
- **Immersive Narrative:** Designed to add depth, lore, and realism to your career mode saves.
