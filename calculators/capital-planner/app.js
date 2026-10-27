/**
 * CAPITAL PLANNER — gross-production ROI path
 * Requires data.js: BUILDING_DB, PRODUCTION_CURVE, getBuildingCost
 */

const CONSTANTS = {
  TRIBE_EGYPT_BONUS: 0.05,
  FACTORY_BONUS: 0.05
};

const TEMPLATES = {
  '4446': { w: 4, c: 4, i: 4, cr: 6 },
  '11115': { w: 1, c: 1, i: 1, cr: 15 },
  '3339': { w: 3, c: 3, i: 3, cr: 9 },
  '4437': { w: 4, c: 4, i: 3, cr: 7 },
  '3447': { w: 3, c: 4, i: 4, cr: 7 },
  '4347': { w: 4, c: 3, i: 4, cr: 7 },
  '3456': { w: 3, c: 4, i: 5, cr: 6 },
  '4536': { w: 4, c: 5, i: 3, cr: 6 },
  '5346': { w: 5, c: 3, i: 4, cr: 6 },
  '3546': { w: 3, c: 5, i: 4, cr: 6 },
  '4356': { w: 4, c: 3, i: 5, cr: 6 },
  '5436': { w: 5, c: 4, i: 3, cr: 6 },
  '00018': { w: 0, c: 0, i: 0, cr: 18 }
};

const FIELD_DB_NAMES = {
  wood: 'Woodcutter',
  clay: 'Clay Pit',
  iron: 'Iron Mine',
  crop: 'Cropland'
};

const FACTORIES = [
  { id: 'sawmill', db: 'Sawmill', reqField: 'wood', reqLvl: 10, enabled: 'useSawmill' },
  { id: 'brickyard', db: 'Brickyard', reqField: 'clay', reqLvl: 10, enabled: 'useBrickyard' },
  { id: 'foundry', db: 'Iron Foundry', reqField: 'iron', reqLvl: 10, enabled: 'useFoundry' },
  { id: 'mill', db: 'Grain Mill', reqField: 'crop', reqLvl: 5, enabled: 'useMill' },
  { id: 'bakery', db: 'Bakery', reqField: 'crop', reqLvl: 10, reqBuild: 'mill', reqBuildLvl: 5, enabled: 'useBakery' },
  { id: 'waterworks', db: 'Waterworks', tribe: 'egyptian', reqBuild: 'hm', reqBuildLvl: 10, enabled: 'useWaterworks' }
];

const RESOURCES = ['wood', 'clay', 'iron', 'crop'];
const BUILDING_KEYS = ['sawmill', 'brickyard', 'foundry', 'mill', 'bakery', 'waterworks', 'hm'];
const OASIS_LEVELS = [10, 15, 20];

const OASIS_TYPES = [
  ['none', 'None'],
  ['crop-25', '🌾 Crop 25%'],
  ['crop-50', '🌾 Crop 50%'],
  ['wood-25', '🌲 Wood 25%'],
  ['wood-50', '🌲 Wood 50%'],
  ['wood-25_crop-25', '🌲 Wood 25% + 🌾 Crop 25%'],
  ['clay-25', '🧱 Clay 25%'],
  ['clay-50', '🧱 Clay 50%'],
  ['clay-25_crop-25', '🧱 Clay 25% + 🌾 Crop 25%'],
  ['iron-25', '⚒️ Iron 25%'],
  ['iron-50', '⚒️ Iron 50%'],
  ['iron-25_crop-25', '⚒️ Iron 25% + 🌾 Crop 25%']
];

const deepCopy = value => JSON.parse(JSON.stringify(value));

class TravianEngine {
  constructor(config) {
    this.config = config;
    this.state = this.getInitialState();
  }

  getInitialState() {
    const tpl = TEMPLATES[this.config.villageType] || TEMPLATES['4446'];
    const counts = { wood: tpl.w, clay: tpl.c, iron: tpl.i, crop: tpl.cr };
    const start = this.config.start || {};
    const state = { claimedOases: [] };

    // Missing levels default to 0; extra levels beyond the layout are ignored.
    RESOURCES.forEach(resource => {
      const levels = (start[resource] || []).slice(0, counts[resource]);
      state[resource] = levels.concat(Array(counts[resource] - levels.length).fill(0));
    });
    BUILDING_KEYS.forEach(key => { state[key] = start[key] || 0; });

    // Already-annexed oases must still fit the Hero's Mansion slots (10/15/20).
    (start.claimedOases || []).forEach(index => {
      if (state.claimedOases.length < OASIS_LEVELS.length && this.config.oases[index]
        && Object.keys(this.config.oases[index]).length) {
        state.claimedOases.push(index);
      }
    });
    const minHm = OASIS_LEVELS[state.claimedOases.length - 1] || 0;
    state.hm = Math.max(state.hm, minHm);
    return state;
  }

  calculateHourlyProduction(state) {
    const base = resource => state[resource].reduce(
      (sum, level) => sum + PRODUCTION_CURVE[level], 0
    );
    const oasisBonus = { wood: 0, clay: 0, iron: 0, crop: 0 };

    state.claimedOases.forEach(index => {
      const oasis = this.config.oases[index];
      if (!oasis) return;
      ['wood', 'clay', 'iron', 'crop'].forEach(resource => {
        oasisBonus[resource] += oasis[resource] || 0;
      });
    });

    // Waterworks improves oasis bonuses only; resource buildings remain additive.
    const waterworksMultiplier = this.config.tribe === 'egyptian'
      ? 1 + state.waterworks * CONSTANTS.TRIBE_EGYPT_BONUS
      : 1;
    const buildingBonus = {
      wood: state.sawmill * CONSTANTS.FACTORY_BONUS,
      clay: state.brickyard * CONSTANTS.FACTORY_BONUS,
      iron: state.foundry * CONSTANTS.FACTORY_BONUS,
      crop: (state.mill + state.bakery) * CONSTANTS.FACTORY_BONUS
    };
    const production = {};

    // Travian Legends (T4) sums all bonuses on base field production;
    // older T3-style servers apply the gold bonus on top of the other bonuses.
    RESOURCES.forEach(resource => {
      const bonus = 1 + buildingBonus[resource] + oasisBonus[resource] * waterworksMultiplier;
      production[resource] = this.config.stacking === 'multiplicative'
        ? base(resource) * bonus * this.config.goldBonus
        : base(resource) * (bonus + this.config.goldBonus - 1);
    });

    const speed = this.config.speed || 1;
    RESOURCES.forEach(resource => { production[resource] *= speed; });
    production.total = production.wood + production.clay + production.iron + production.crop;
    return production;
  }

  getHeroMansionCosts(fromLevel, targetLevel) {
    const costs = [];
    for (let level = fromLevel + 1; level <= targetLevel; level++) {
      const cost = getBuildingCost("Hero's Mansion", level);
      if (!cost) return null;
      costs.push({ level, cost: cost.total });
    }
    return costs;
  }

  evaluateField(resource, index, currentTotal) {
    const state = deepCopy(this.state);
    const level = state[resource][index];
    if (level >= this.config.maxLevel) return null;

    const cost = getBuildingCost(FIELD_DB_NAMES[resource], level + 1);
    if (!cost) return null;
    state[resource][index]++;

    return this.makeMove({
      type: 'field', resource, index, level: level + 1,
      cost: cost.total, state, currentTotal
    });
  }

  evaluateBuilding(factory, currentTotal) {
    const state = deepCopy(this.state);
    const level = state[factory.id];
    const db = BUILDING_DB[factory.db];
    if (!db || level >= db.max) return null;

    const cost = getBuildingCost(factory.db, level + 1);
    if (!cost) return null;
    state[factory.id]++;

    return this.makeMove({
      type: 'building', key: factory.id, name: factory.db, level: level + 1,
      cost: cost.total, state, currentTotal
    });
  }

  evaluateOasis(oasisIndex, currentTotal) {
    if (this.state.claimedOases.includes(oasisIndex)) return null;
    const requiredHm = OASIS_LEVELS[this.state.claimedOases.length];
    if (requiredHm === undefined) return null;

    const hmSteps = this.getHeroMansionCosts(this.state.hm, requiredHm);
    if (!hmSteps) return null;

    const state = deepCopy(this.state);
    state.hm = Math.max(state.hm, requiredHm);
    state.claimedOases.push(oasisIndex);
    const cost = hmSteps.reduce((sum, step) => sum + step.cost, 0);

    return this.makeMove({
      type: 'oasis', oasisIndex, requiredHm, hmSteps,
      cost, state, currentTotal
    });
  }

  makeMove(move) {
    const newProduction = this.calculateHourlyProduction(move.state);
    const gain = newProduction.total - move.currentTotal;
    // An oasis can be free when the Hero's Mansion is already high enough.
    if (gain <= 0.01 || (move.cost <= 0 && move.type !== 'oasis')) return null;

    return {
      ...move,
      production: newProduction.total,
      gain,
      roi: move.cost / gain
    };
  }

  isFactoryAvailable(factory) {
    if (!this.config[factory.enabled]) return false;
    if (factory.tribe && this.config.tribe !== factory.tribe) return false;
    if (factory.reqField && Math.max(...this.state[factory.reqField]) < factory.reqLvl) return false;
    if (factory.reqBuild && this.state[factory.reqBuild] < factory.reqBuildLvl) return false;
    return true;
  }

  getCandidates(currentTotal) {
    const candidates = [];

    // Evaluate every legal individual field upgrade, not only the lowest field.
    ['wood', 'clay', 'iron', 'crop'].forEach(resource => {
      this.state[resource].forEach((_, index) => {
        const candidate = this.evaluateField(resource, index, currentTotal);
        if (candidate) candidates.push(candidate);
      });
    });

    FACTORIES.forEach(factory => {
      if (!this.isFactoryAvailable(factory)) return;
      const candidate = this.evaluateBuilding(factory, currentTotal);
      if (candidate) candidates.push(candidate);
    });

    // Oasis order is chosen by ROI; UI slot order does not constrain annexation order.
    this.config.oases.forEach((oasis, index) => {
      if (!oasis || Object.keys(oasis).length === 0) return;
      const candidate = this.evaluateOasis(index, currentTotal);
      if (candidate) candidates.push(candidate);
    });

    return candidates;
  }

  // Call before this.state is replaced: Hero's Mansion levels add no production,
  // so those rows keep the pre-annex production and show the mansion growing.
  addOasisSteps(steps, move, totalSpent) {
    let runningTotal = totalSpent;
    const production = Math.round(this.calculateHourlyProduction(this.state).total);
    const hmState = deepCopy(this.state);

    move.hmSteps.forEach(hm => {
      runningTotal += hm.cost;
      hmState.hm = hm.level;
      steps.push({
        type: 'hm',
        level: hm.level,
        production,
        cost: hm.cost,
        totalSpent: runningTotal,
        roi: null,
        state: deepCopy(hmState)
      });
    });

    steps.push({
      type: 'oasis',
      oasisIndex: move.oasisIndex,
      level: move.state.claimedOases.length,
      production: Math.round(move.production),
      cost: 0,
      packageCost: move.cost,
      totalSpent: runningTotal,
      roi: move.roi,
      state: deepCopy(move.state)
    });

    return runningTotal;
  }

  runSimulation() {
    const steps = [{
      type: 'start', level: 0,
      production: Math.round(this.calculateHourlyProduction(this.state).total),
      cost: 0, totalSpent: 0, roi: null, state: deepCopy(this.state)
    }];
    let totalSpent = 0;
    const MAX_ACTIONS = 2000;

    for (let actionCount = 0; actionCount < MAX_ACTIONS; actionCount++) {
      const currentTotal = this.calculateHourlyProduction(this.state).total;
      const candidates = this.getCandidates(currentTotal);
      if (!candidates.length) break;

      candidates.sort((a, b) => a.roi - b.roi || b.gain - a.gain);
      const best = candidates[0];

      if (best.type === 'oasis') {
        totalSpent = this.addOasisSteps(steps, best, totalSpent);
        this.state = best.state;
        continue;
      }
      this.state = best.state;

      totalSpent += best.cost;
      steps.push({
        type: best.type === 'field' ? best.resource : best.key,
        level: best.level,
        production: Math.round(best.production),
        cost: best.cost,
        totalSpent,
        roi: best.roi,
        state: deepCopy(this.state)
      });
    }

    return { steps, totalSpent };
  }
}

const UI = {
  chartInstance: null,
  currentResult: null,

  init() {
    ['oasis1', 'oasis2', 'oasis3'].forEach(id => {
      document.getElementById(id).innerHTML = OASIS_TYPES
        .map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    });
    document.getElementById('villageType').addEventListener('change', () => this.updateFieldHints());
    this.updateFieldHints();
  },

  setTab(view) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    document.querySelectorAll('.nav-tab')[view === 'calc' ? 0 : 1].classList.add('active');
    if (view === 'chart') this.updateChart();
  },

  updateFieldHints() {
    const tpl = TEMPLATES[document.getElementById('villageType').value];
    const counts = { wood: tpl.w, clay: tpl.c, iron: tpl.i, crop: tpl.cr };
    RESOURCES.forEach(resource => {
      const input = document.getElementById(`start-${resource}`);
      input.disabled = counts[resource] === 0;
      input.placeholder = counts[resource] ? `${counts[resource]} fields, e.g. 10,10,9` : 'no fields';
      document.getElementById(`count-${resource}`).textContent = `(${counts[resource]})`;
    });
  },

  getOasisVal(id) {
    const value = document.getElementById(id).value;
    if (value === 'none') return {};
    return value.split('_').reduce((oasis, part) => {
      const [resource, percent] = part.split('-');
      oasis[resource] = Number(percent) / 100;
      return oasis;
    }, {});
  },

  parseLevels(text) {
    return text.split(/[\s,;]+/).filter(Boolean)
      .map(Number).filter(Number.isFinite)
      .map(level => Math.min(PRODUCTION_CURVE.length - 1, Math.max(0, Math.round(level))));
  },

  readStart() {
    const start = { claimedOases: [] };
    RESOURCES.forEach(resource => {
      start[resource] = this.parseLevels(document.getElementById(`start-${resource}`).value);
    });
    BUILDING_KEYS.forEach(key => {
      const max = key === 'hm' ? 20 : BUILDING_DB[FACTORIES.find(f => f.id === key).db].max;
      start[key] = Math.min(max, Math.max(0, Number(document.getElementById(`start-${key}`).value) || 0));
    });
    ['oasis1', 'oasis2', 'oasis3'].forEach((id, index) => {
      if (document.getElementById(`${id}-owned`).checked) start.claimedOases.push(index);
    });
    return start;
  },

  calculateMain() {
    const config = {
      villageType: document.getElementById('villageType').value,
      tribe: document.getElementById('tribe').value,
      maxLevel: Number(document.getElementById('maxLevel').value),
      goldBonus: Number(document.getElementById('goldBonus').value),
      stacking: document.getElementById('stacking').value,
      speed: Math.max(1, Number(document.getElementById('speed').value) || 1),
      oases: ['oasis1', 'oasis2', 'oasis3'].map(id => this.getOasisVal(id)),
      start: this.readStart(),
      useSawmill: document.getElementById('useSawmill').checked,
      useBrickyard: document.getElementById('useBrickyard').checked,
      useFoundry: document.getElementById('useFoundry').checked,
      useMill: document.getElementById('useMill').checked,
      useBakery: document.getElementById('useBakery').checked,
      useWaterworks: document.getElementById('useWaterworks').checked
    };

    this.currentResult = new TravianEngine(config).runSimulation();
    this.renderTable(this.currentResult);
    if (document.getElementById('view-chart').classList.contains('active')) this.updateChart();
  },

  updateChart() {
    if (!this.currentResult) return;
    const canvas = document.getElementById('analysisChart');
    const context = canvas.getContext('2d');
    if (this.chartInstance) this.chartInstance.destroy();

    const allPoints = this.currentResult.steps.map(step => ({ x: step.totalSpent, y: step.production }));
    const interval = Math.max(1, Math.ceil(allPoints.length / 50));
    const points = allPoints.filter((_, index) => index % interval === 0 || index === allPoints.length - 1);

    this.chartInstance = new Chart(context, {
      type: 'line',
      data: {
        datasets: [{
          label: 'Gross hourly production', data: points,
          borderColor: '#859f51', backgroundColor: 'rgba(133,159,81,.1)',
          fill: true, tension: .2, pointRadius: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Total resources invested' } },
          y: { title: { display: true, text: 'Gross hourly production' } }
        }
      }
    });
  },

  actionName(type) {
    return {
      wood: 'Woodcutter', clay: 'Clay Pit', iron: 'Iron Mine', crop: 'Cropland',
      sawmill: 'Sawmill', brickyard: 'Brickyard', foundry: 'Iron Foundry',
      mill: 'Grain Mill', bakery: 'Bakery', waterworks: 'Waterworks',
      hm: "Hero's Mansion", oasis: 'Annex oasis'
    }[type] || type;
  },

  formatHours(hours) {
    if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
    if (hours < 48) return `${Math.round(hours)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  },

  // Collapse runs of identical field upgrades ("15× Cropland → 1") and
  // Hero's Mansion levels ("Hero's Mansion 1 → 10") into one row.
  groupSteps(steps) {
    const groups = [];
    steps.forEach(step => {
      const last = groups[groups.length - 1];
      const sameField = last && RESOURCES.includes(step.type)
        && last.type === step.type && last.level === step.level;
      const nextHm = last && step.type === 'hm' && last.type === 'hm' && last.level + 1 === step.level;
      if (sameField || nextHm) {
        last.count++;
        last.level = step.level;
        last.cost += step.cost;
        last.production = step.production;
        last.totalSpent = step.totalSpent;
        last.state = step.state;
        last.roi = step.roi;
        return;
      }
      groups.push({ ...step, count: 1, fromLevel: step.level });
    });
    return groups;
  },

  describe(group) {
    if (group.type === 'oasis') {
      const value = document.getElementById(`oasis${group.oasisIndex + 1}`).value;
      const label = (OASIS_TYPES.find(([key]) => key === value) || [, ''])[1];
      return `Annex oasis ${group.oasisIndex + 1} (${label})`;
    }
    if (group.type === 'hm') {
      return group.count > 1
        ? `Hero's Mansion ${group.fromLevel} → ${group.level}`
        : `Hero's Mansion → ${group.level}`;
    }
    const times = group.count > 1 ? `${group.count}× ` : '';
    return `${times}${this.actionName(group.type)} → level ${group.level}`;
  },

  renderTable(result) {
    document.getElementById('results-area').style.display = 'block';
    const first = result.steps[0];
    const last = result.steps[result.steps.length - 1];
    const gained = last.production - first.production;
    document.getElementById('start-prod').textContent = first.production.toLocaleString();
    document.getElementById('final-prod').textContent = last.production.toLocaleString();
    document.getElementById('final-cost').textContent = result.totalSpent.toLocaleString();
    document.getElementById('final-roi').textContent = gained > 0
      ? this.formatHours(result.totalSpent / gained) : '—';

    const container = document.getElementById('output-grouped');
    container.innerHTML = '';
    if (result.steps.length < 2) {
      container.innerHTML = '<p class="empty-note">Nothing left to upgrade with these settings.</p>';
      return;
    }

    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>#</th><th>Action</th><th>Cost</th><th>Payback</th><th>Production / h</th><th>Village state</th></tr></thead><tbody></tbody>';
    const body = table.querySelector('tbody');

    this.groupSteps(result.steps.slice(1)).forEach((group, index) => {
      const row = document.createElement('tr');
      row.className = `row-${group.type === 'oasis' || group.type === 'hm' ? 'oasis' : RESOURCES.includes(group.type) ? group.type : 'building'}`;
      const cost = group.type === 'oasis' ? `<span class="muted">package ${group.packageCost.toLocaleString()}</span>` : group.cost.toLocaleString();
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${this.describe(group)}</td>
        <td>${cost}</td>
        <td>${this.formatHours(group.roi)}</td>
        <td>${group.production.toLocaleString()}</td>
        <td class="state-cell">${this.renderState(group.state)}</td>`;
      body.appendChild(row);
    });

    container.appendChild(table);
  },

  renderState(state) {
    const fields = RESOURCES.map(resource => {
      if (!state[resource].length) return '';
      const levels = state[resource].reduce((counts, level) => {
        counts[level] = (counts[level] || 0) + 1;
        return counts;
      }, {});
      const text = Object.entries(levels)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([level, count]) => `${count}×${level}`).join(' ');
      return `${resource[0].toUpperCase()}: ${text}`;
    }).filter(Boolean);

    const buildings = [
      ['sawmill', 'S'], ['brickyard', 'B'], ['foundry', 'F'],
      ['mill', 'M'], ['bakery', 'Ba'], ['waterworks', 'W'], ['hm', 'HM']
    ].filter(([key]) => state[key] > 0)
      .map(([key, label]) => `${label}${state[key]}`);

    const oasis = state.claimedOases.length ? `Oases: ${state.claimedOases.length}` : '';
    return [...fields, buildings.join(' '), oasis].filter(Boolean).join('<br>');
  }
};

document.addEventListener('DOMContentLoaded', () => UI.init());
