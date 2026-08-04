/* store.js — Capa de datos del Programa Impulso (NUBE: Firestore + Auth).
 * Toda la persistencia pasa por aquí. Métodos asíncronos (devuelven Promesas).
 *
 * Modelo de auth:
 *   - Colaborador: entra con nombre + DNI. Por detrás usa email <dni>@impulso.movadera.pe
 *     y contraseña = DNI. (Cómodo pero débil: sirve para organizar, no para proteger.)
 *   - Admin (José Luis): email + contraseña fuerte. Su correo está en ADMIN_EMAILS.
 *     El admin VE todos los proyectos en modo lectura (las reglas de Firestore le niegan escribir).
 */
(function (g) {
  const ADMIN_EMAILS = ['jlmv6161@gmail.com'];          // ← correos con rol admin
  const DNI_DOMAIN = '@impulso.movadera.pe';
  const dniToEmail = dni => String(dni || '').trim() + DNI_DOMAIN;
  const clean = s => (s || '').toString().trim();
  const serverTs = () => firebase.firestore.FieldValue.serverTimestamp();
  const ms = v => (v && v.toMillis) ? v.toMillis() : (v && v.seconds ? v.seconds * 1000 : 0);

  let _profile = null;   // { uid, email, dni, nombre, isAdmin }

  function buildProfile(user, nombreHint) {
    const email = (user.email || '').toLowerCase();
    const isAdmin = ADMIN_EMAILS.includes(email);
    const dni = email.endsWith(DNI_DOMAIN) ? email.slice(0, -DNI_DOMAIN.length) : '';
    return { uid: user.uid, email, dni, nombre: nombreHint || user.displayName || (isAdmin ? 'Administrador' : ''), isAdmin };
  }

  const col = () => fb.db.collection('projects');

  const Store = {
    /* Se dispara cuando Firebase resuelve la sesión (al cargar y en cada cambio). */
    onAuth(cb) {
      fb.auth.onAuthStateChanged(user => {
        _profile = user ? buildProfile(user) : null;
        cb(_profile);
      });
    },
    currentUser() { return _profile; },
    isAdmin() { return !!(_profile && _profile.isAdmin); },

    /* ---- login ---- */
    async loginColaborador(nombre, dni) {
      nombre = clean(nombre); dni = clean(dni);
      if (!nombre || !dni) throw new Error('Escribe tu nombre y tu DNI.');
      const email = dniToEmail(dni), pass = dni;
      try {
        await fb.auth.signInWithEmailAndPassword(email, pass);
      } catch (e) {
        if (e.code === 'auth/user-not-found') await fb.auth.createUserWithEmailAndPassword(email, pass);
        else if (e.code === 'auth/wrong-password') throw new Error('Ese DNI ya está registrado con otro nombre/clave. Verifica el número.');
        else throw e;
      }
      const u = fb.auth.currentUser;
      if (u.displayName !== nombre) { try { await u.updateProfile({ displayName: nombre }); } catch (e) {} }
      _profile = buildProfile(u, nombre);
      return _profile;
    },
    async loginAdmin(email, pass) {
      email = clean(email).toLowerCase();
      if (!ADMIN_EMAILS.includes(email)) throw new Error('Ese correo no está autorizado como administrador.');
      if (!pass) throw new Error('Escribe tu contraseña.');
      try {
        await fb.auth.signInWithEmailAndPassword(email, pass);
      } catch (e) {
        if (e.code === 'auth/user-not-found') await fb.auth.createUserWithEmailAndPassword(email, pass);
        else if (e.code === 'auth/wrong-password') throw new Error('Contraseña incorrecta.');
        else throw e;
      }
      _profile = buildProfile(fb.auth.currentUser);
      return _profile;
    },
    async logout() { await fb.auth.signOut(); _profile = null; },

    /* ---- proyectos ---- */
    async listProjects() {
      const u = _profile; if (!u) return [];
      const snap = await col().where('ownerUid', '==', u.uid).get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
    },
    async listAllProjects() {   // solo admin
      const snap = await col().get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
    },
    async createProject(nombre) {
      const u = _profile; if (!u) return null;
      const ref = await col().add({
        ownerUid: u.uid, ownerDni: u.dni, ownerNombre: u.nombre,
        nombre: clean(nombre) || 'Proyecto sin nombre',
        costeo: null, createdAt: serverTs(), updatedAt: serverTs()
      });
      return { id: ref.id, nombre: clean(nombre) };
    },
    async getProject(id) {
      const d = await col().doc(id).get();
      return d.exists ? { id: d.id, ...d.data() } : null;
    },
    async renameProject(id, nombre) {
      await col().doc(id).update({ nombre: clean(nombre), updatedAt: serverTs() });
    },
    async deleteProject(id) { await col().doc(id).delete(); },

    /* ---- datos de la hoja de costeo (guardados dentro del proyecto) ---- */
    async loadCosteo(id) { const p = await this.getProject(id); return p ? (p.costeo || null) : null; },
    async saveCosteo(id, state) {
      await col().doc(id).update({ costeo: state, updatedAt: serverTs() });
    },

    /* ---- proyecto activo (solo navegación, no dato) ---- */
    setActiveProject(id) { try { localStorage.setItem('impulso.active', id); } catch (e) {} },
    getActiveProject() { try { return localStorage.getItem('impulso.active'); } catch (e) { return null; } },

    ms  // helper expuesto para formatear fechas en la UI
  };

  g.ImpulsoStore = Store;
})(window);
