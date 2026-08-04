/* store.js — Capa de datos del Programa Impulso
 * Guarda en el navegador (localStorage), por dispositivo.
 * Toda la persistencia pasa por aquí: si algún día se migra a un backend
 * (Firebase/Supabase), solo cambia este archivo, no la interfaz.
 */
(function (global) {
  const K = {
    session: 'impulso.session',
    users: 'impulso.users',
    projects: dni => `impulso.projects.${dni}`,
    costeo: (dni, pid) => `impulso.costeo.${dni}.${pid}`,
    active: 'impulso.activeProject'
  };
  const read = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const now = () => Date.now();
  const uid = () => 'p' + now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clean = s => (s || '').toString().trim();

  const Store = {
    /* ---- sesión / usuario ---- */
    currentUser() { return read(K.session, null); },
    login(nombre, dni) {
      nombre = clean(nombre); dni = clean(dni);
      if (!nombre || !dni) return null;
      const users = read(K.users, {});
      if (!users[dni]) users[dni] = { dni, nombre, createdAt: now() };
      else users[dni].nombre = nombre;
      write(K.users, users);
      const s = { dni, nombre };
      write(K.session, s);
      return s;
    },
    logout() { localStorage.removeItem(K.session); localStorage.removeItem(K.active); },

    /* ---- proyectos ---- */
    listProjects() {
      const u = this.currentUser(); if (!u) return [];
      return read(K.projects(u.dni), []).slice().sort((a, b) => b.updatedAt - a.updatedAt);
    },
    createProject(nombre) {
      const u = this.currentUser(); if (!u) return null;
      const list = read(K.projects(u.dni), []);
      const p = { id: uid(), nombre: clean(nombre) || 'Proyecto sin nombre', createdAt: now(), updatedAt: now() };
      list.push(p); write(K.projects(u.dni), list);
      return p;
    },
    getProject(id) {
      const u = this.currentUser(); if (!u) return null;
      return read(K.projects(u.dni), []).find(p => p.id === id) || null;
    },
    renameProject(id, nombre) {
      const u = this.currentUser(); if (!u) return;
      const list = read(K.projects(u.dni), []);
      const p = list.find(x => x.id === id);
      if (p) { p.nombre = clean(nombre) || p.nombre; p.updatedAt = now(); write(K.projects(u.dni), list); }
    },
    deleteProject(id) {
      const u = this.currentUser(); if (!u) return;
      const list = read(K.projects(u.dni), []).filter(x => x.id !== id);
      write(K.projects(u.dni), list);
      localStorage.removeItem(K.costeo(u.dni, id));
    },
    touchProject(id) {
      const u = this.currentUser(); if (!u) return;
      const list = read(K.projects(u.dni), []);
      const p = list.find(x => x.id === id);
      if (p) { p.updatedAt = now(); write(K.projects(u.dni), list); }
    },
    setActiveProject(id) { write(K.active, id); },
    getActiveProject() { return read(K.active, null); },

    /* ---- datos de la hoja de costeo, por proyecto ---- */
    loadCosteo(pid) {
      const u = this.currentUser(); if (!u) return null;
      return read(K.costeo(u.dni, pid), null);
    },
    saveCosteo(pid, state) {
      const u = this.currentUser(); if (!u) return;
      write(K.costeo(u.dni, pid), state);
      this.touchProject(pid);
    }
  };

  global.ImpulsoStore = Store;
})(window);
