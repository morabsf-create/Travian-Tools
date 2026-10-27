# 🏰 Travian Planner 8.6

An advanced, browser-based resource and building planner for the strategy game **Travian: Legends**. This tool uses an optimization algorithm to calculate the most cost-effective development path (best Return on Investment or ROI) for a village, prioritizing field upgrades and production buildings based on user-defined weights and settings.

---

## 🚀 Features

The repository is a small hub of client-side tools: **Capital Planner**, **Troop Calculator** and **Hammer Tracker**.

### 🏛️ Capital Planner

Builds a step-by-step development order for a capital, always choosing the upgrade that pays itself back fastest (lowest cost ÷ production gain).

* **Field layouts:** all standard distributions (4-4-4-6, 3-3-3-9, 1-1-1-15, 0-0-0-18, the 7-croppers, 5-x variants).
* **Current village:** enter your current field levels, production buildings, Hero's Mansion and already-annexed oases to plan from where you are instead of from level 0.
* **Production buildings:** Sawmill, Brickyard, Iron Foundry, Grain Mill, Bakery and (Egyptians) Waterworks, with their prerequisites.
* **Oases:** up to 3, including 50% wood/clay/iron/crop oases. Hero's Mansion 10/15/20 is planned as one package together with the oasis it unlocks.
* **Bonus stacking:** additive (Travian Legends / T4: gold, oases and buildings are summed on base production) or the older T3 rule (gold multiplies the other bonuses).
* **Server speed:** scales production so payback times are in real hours on speed servers.
* **Results:** start/final hourly production, total cost, overall payback, and a grouped build list with per-step cost and payback. A chart tab shows production against resources invested.

## 🛠️ Usage

Everything is **client-side**: open `index.html` in a browser (or the GitHub Pages site) and pick a tool.

For the Capital Planner:

1. Choose field layout, max level, tribe, gold bonus, bonus stacking and server speed.
2. Select your oases and tick **owned** for those already annexed.
3. Optionally fill in **Current Village** (e.g. `17,17,18,…` for croplands) and **Current Buildings**.
4. Click **Calculate Optimal Path** and follow the build list top to bottom.

---

## ⚙️ Technical Details

The planner is built using plain HTML, CSS, and vanilla JavaScript.

* **Engine:** The core logic is handled by the `TravianEngine` class, which implements a greedy algorithm.
* **Optimization Metric:** payback time, calculated as:
    $$\text{Total upgrade cost} / \text{Gross hourly production gain}$$
    The algorithm always selects the upgrade with the lowest payback. Gross production ignores crop upkeep of new population.
* **Dependencies:**
    * **Chart.js:** Used for the production chart in the Capital Planner.
    * **Google Fonts:** `Roboto` (for data) and `Vollkorn` (for headings) for styling.

---

## 📝 Configuration and Development

Game data lives in `js/data.js`:

* **`BUILDING_DB`:** base costs, cost growth factor (`k`) and max level per building; `getBuildingCost(name, level)` rounds to 5 like the game.
* **`PRODUCTION_CURVE`:** base hourly production of a resource field per level (speed 1×).

Capital-planner rules (templates, factory prerequisites, oasis slots) are at the top of `calculators/capital-planner/app.js`.
