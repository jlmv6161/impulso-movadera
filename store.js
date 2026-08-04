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

  /* Inicia sesión; si la cuenta no existe, la crea. Firebase reciente devuelve
   * 'auth/invalid-credential' tanto para cuenta inexistente como para clave errada,
   * así que distinguimos por el resultado de intentar crearla. */
  async function signInOrCreate(email, pass) {
    try {
      await fb.auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
      const c = e.code || '';
      if (c === 'auth/user-not-found' || c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials') {
        try {
          await fb.auth.createUserWithEmailAndPassword(email, pass);
        } catch (e2) {
          if (e2.code === 'auth/email-already-in-use') { const err = new Error('WRONGPASS'); err.wrongpass = true; throw err; }
          if (e2.code === 'auth/weak-password') throw new Error('La contraseña debe tener al menos 6 caracteres.');
          throw e2;
        }
      } else { throw e; }
    }
  }

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
      if (dni.length < 6) throw new Error('El DNI debe tener al menos 6 dígitos.');
      try { await signInOrCreate(dniToEmail(dni), dni); }
      catch (e) { if (e.wrongpass) throw new Error('Ese DNI ya está registrado con otra clave. Verifica el número.'); throw e; }
      const u = fb.auth.currentUser;
      // El DNI es la identidad. El nombre se fija SOLO la primera vez y luego se conserva,
      // así un error de tipeo en el nombre en un ingreso posterior no cambia nada.
      let nombreFinal = u.displayName;
      if (!nombreFinal) { try { await u.updateProfile({ displayName: nombre }); } catch (_) {} nombreFinal = nombre; }
      _profile = buildProfile(u, nombreFinal);
      return _profile;
    },
    async loginAdmin(email, pass) {
      email = clean(email).toLowerCase();
      if (!ADMIN_EMAILS.includes(email)) throw new Error('Ese correo no está autorizado como administrador.');
      if (!pass) throw new Error('Escribe tu contraseña.');
      if (pass.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
      try { await signInOrCreate(email, pass); }
      catch (e) { if (e.wrongpass) throw new Error('Contraseña incorrecta.'); throw e; }
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

    /* ---- datos del manual llenado (campo aparte del proyecto) ---- */
    async loadManual(id) { const p = await this.getProject(id); return p ? (p.manual || null) : null; },
    async saveManual(id, data) {
      await col().doc(id).update({ manual: data, updatedAt: serverTs() });
    },

    /* ---- proyecto activo (solo navegación, no dato) ---- */
    setActiveProject(id) { try { localStorage.setItem('impulso.active', id); } catch (e) {} },
    getActiveProject() { try { return localStorage.getItem('impulso.active'); } catch (e) { return null; } },

    ms  // helper expuesto para formatear fechas en la UI
  };

  g.ImpulsoStore = Store;
})(window);
