// Operaciones UKA · Portada: uso sin conexión.
// Con internet, la app (dentro del marco) manda aquí una copia de su código, el perfil y las consultas que se usan en campo.
// Todo se guarda solo en este equipo (IndexedDB de operacionesuka.github.io). Aquí no hay datos: solo el código que los guarda.
// Sin internet, se abre la misma app con lo guardado. Lo que se captura queda en una cola y la app lo envía al volver la señal.
(function () {
  var DB = null, OFFS = null, PEND = 0;
  var VENCE_HORAS = 168, MAX_FOTOS_PLAN = 3, MAX_FOTOS_COLA = 30;

  // ---------- Base de datos del equipo ----------
  function abrirDB() {
    return new Promise(function (ok, mal) {
      if (DB) { ok(DB); return; }
      var r = indexedDB.open('ukaOffline', 1);
      r.onupgradeneeded = function () { var db = r.result; ['kv', 'resp', 'cola'].forEach(function (n) { if (!db.objectStoreNames.contains(n)) db.createObjectStore(n); }); };
      r.onsuccess = function () { DB = r.result; ok(DB); };
      r.onerror = function () { mal(r.error); };
    });
  }
  function tx(store, modo, fn) {
    return abrirDB().then(function (db) {
      return new Promise(function (ok, mal) {
        var t = db.transaction(store, modo), q = fn(t.objectStore(store)), res;
        if (q) q.onsuccess = function () { res = q.result; };
        t.oncomplete = function () { ok(res); };
        t.onerror = function () { mal(t.error); };
        t.onabort = function () { mal(t.error); };
      });
    });
  }
  function get(s, k) { return tx(s, 'readonly', function (o) { return o.get(k); }); }
  function put(s, k, v) { return tx(s, 'readwrite', function (o) { return o.put(v, k); }); }
  function del(s, k) { return tx(s, 'readwrite', function (o) { return o.delete(k); }); }
  function todos(s) { return tx(s, 'readonly', function (o) { return o.getAll(); }); }

  function dos(n) { return ('0' + n).slice(-2); }
  function hoyLocal() { var d = new Date(); return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()); }
  function ahoraLocal() { var d = new Date(); return hoyLocal() + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes()); }
  function horasDesde(f) {
    var p = String(f || '').split(' '), a = String(p[0] || '').split('-'), h = String(p[1] || '00:00').split(':');
    var d = new Date(Number(a[0]), Number(a[1]) - 1, Number(a[2]), Number(h[0]) || 0, Number(h[1]) || 0);
    return (Date.now() - d.getTime()) / 3600000;
  }
  function claveResp(u, fn, args) { return u + '|' + fn + '|' + JSON.stringify(args); }
  function colaDe(u) { return todos('cola').then(function (l) { return (l || []).filter(function (x) { return x.usuario === u; }).sort(function (a, b) { return a.cuando < b.cuando ? -1 : 1; }); }); }
  function guardarDurable() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { } }

  // ---------- Mensajes de la app (con internet) ----------
  window.addEventListener('message', function (e) {
    var host = '';
    try { host = new URL(e.origin).hostname; } catch (x) { return; }
    if (host.slice(-22) !== '.googleusercontent.com' && host !== 'script.google.com') return;
    var d = e.data || {};
    if (String(d.uka || '').indexOf('off-') !== 0 || !d.usuario) return;
    var src = e.source, org = e.origin, u = String(d.usuario);
    var responder = function (m) { try { src.postMessage(m, org); } catch (x) { } };
    if (d.uka === 'off-hola') {
      Promise.all([get('kv', 'paquete'), get('kv', 'respaldo|' + u), colaDe(u)]).then(function (r) {
        responder({ uka: 'off-estado', usuario: u, version: r[0] ? r[0].version : '', respaldo: r[1] || '', pendientes: r[2].length });
      });
    }
    if (d.uka === 'off-paquete') put('kv', 'paquete', { version: d.version, html: d.html, modulos: d.modulos, logo: d.logo || '', t: Date.now() });
    if (d.uka === 'off-perfil') put('kv', 'perfil', { usuario: u, perfil: d.perfil, t: Date.now() });
    if (d.uka === 'off-resp') put('resp', claveResp(u, d.fn, d.args || []), { usuario: u, fn: d.fn, args: d.args || [], data: d.data, t: Date.now() });
    if (d.uka === 'off-respaldo') { put('kv', 'respaldo|' + u, d.fecha); put('kv', 'rol|' + u, d.rol || ''); guardarDurable(); }
    if (d.uka === 'off-cola-pedir') colaDe(u).then(function (l) { responder({ uka: 'off-cola', usuario: u, lista: l }); });
    if (d.uka === 'off-cola-hecho') (d.ids || []).forEach(function (id) { del('cola', id); });
    if (d.uka === 'off-salir') {
      todos('resp').then(function (l) {
        (l || []).forEach(function (x) { if (x.usuario === u) del('resp', claveResp(u, x.fn, x.args)); });
      });
      del('kv', 'respaldo|' + u);
      get('kv', 'perfil').then(function (p) { if (p && p.usuario === u) del('kv', 'perfil'); });
    }
  });

  // ---------- Abrir la app con lo guardado ----------
  window.ukaOffDisponible = function () {
    return Promise.all([get('kv', 'paquete'), get('kv', 'perfil')]).then(function (r) {
      if (!r[0] || !r[1]) return null;
      return Promise.all([get('kv', 'respaldo|' + r[1].usuario), get('kv', 'rol|' + r[1].usuario), colaDe(r[1].usuario)]).then(function (x) {
        if (!x[0]) return null;
        return { paq: r[0], perfil: r[1].perfil, usuario: r[1].usuario, respaldo: x[0], rol: x[1] || '', pendientes: x[2].length, vencido: horasDesde(x[0]) > VENCE_HORAS };
      });
    }).catch(function () { return null; });
  };

  var SHIM = '<script>' +
    'window.UKA_OFFLINE = true;' +
    'window.UKA_OFFLINE_INFO = function () { return parent.ukaOffInfo(); };' +
    'window.UKA_OFFLINE_RECONECTAR = function () { parent.ukaOffReconectar(); };' +
    '(function () {' +
    '  function runner() {' +
    '    var ok = null, fail = null;' +
    '    var px = new Proxy({}, { get: function (_, name) {' +
    '      if (name === "withSuccessHandler") return function (f) { ok = f; return px; };' +
    '      if (name === "withFailureHandler") return function (f) { fail = f; return px; };' +
    '      if (name === "withUserObject") return function () { return px; };' +
    '      return function () {' +
    '        var a = JSON.stringify([].slice.call(arguments)), o = ok, fl = fail;' +
    '        parent.ukaOffLlamar(String(name), a).then(function (t) { if (o) o(t === undefined ? undefined : JSON.parse(t)); }, function (m) { if (fl) fl(new Error(String(m))); });' +
    '      };' +
    '    } });' +
    '    return px;' +
    '  }' +
    '  window.google = { script: { get run() { return runner(); }, host: { close: function () { } } } };' +
    '})();' +
    '</scr' + 'ipt>';

  window.ukaOffAbrir = function () {
    return window.ukaOffDisponible().then(function (o) {
      if (!o) return false;
      if (o.vencido) { mensaje('El respaldo de este equipo tiene más de 7 días. Conéctate a internet para actualizarlo.'); return false; }
      OFFS = o;
      PEND = o.pendientes;
      try { localStorage.setItem('brigToken', o.perfil.token); } catch (e) { }
      var html = String(o.paq.html), i = html.indexOf('<head>');
      html = i > -1 ? html.slice(0, i + 6) + SHIM + html.slice(i + 6) : SHIM + html;
      var viejo = document.getElementById('offApp');
      if (viejo) viejo.remove();
      var f = document.createElement('iframe');
      f.id = 'offApp';
      f.title = 'Operaciones UKA sin conexión';
      f.setAttribute('style', 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:5;background:#F3F5F9');
      f.srcdoc = html;
      document.body.appendChild(f);
      var app = document.getElementById('app');
      if (app) app.style.visibility = 'hidden';
      var ini = document.getElementById('inicio');
      if (ini) ini.classList.add('listo');
      var sr = document.getElementById('sinred');
      if (sr) sr.style.display = 'none';
      return true;
    });
  };

  window.ukaOffInfo = function () { return OFFS ? { respaldo: OFFS.respaldo, campo: OFFS.rol === 'campo', pendientes: PEND } : {}; };
  window.ukaOffReconectar = function () {
    if (navigator.onLine) { location.reload(); return; }
    mensaje('Todavía no hay señal. Lo capturado se queda guardado en este equipo.');
  };
  function mensaje(t) {
    var m = document.getElementById('offMsg');
    if (!m) {
      m = document.createElement('div');
      m.id = 'offMsg';
      m.setAttribute('style', 'position:fixed;left:16px;right:16px;bottom:16px;z-index:9;background:#1B3A6B;color:#FFFFFF;padding:12px 16px;border-radius:12px;font-size:15px;text-align:center');
      document.body.appendChild(m);
    }
    m.textContent = t;
    m.style.display = 'block';
    clearTimeout(m._t);
    m._t = setTimeout(function () { m.style.display = 'none'; }, 6000);
  }

  // ---------- Respuestas sin conexión ----------
  var CON_FECHA = { diaCaptura: 1, capturaNar: 1, embCaptura: 1 };
  var ESCRITURAS = { guardarResultado: 1, narMedirCaptura: 1, embControlCaptura: 1, marcarAvisoCambio: 1, subirFotoSalida: 1 };

  function guardados(fn) { return todos('resp').then(function (l) { return (l || []).filter(function (x) { return x.usuario === OFFS.usuario && x.fn === fn; }); }); }

  function buscar(fn, args) {
    if (CON_FECHA[fn] && args.length > 1 && !args[1]) args[1] = hoyLocal();
    return guardados(fn).then(function (l) {
      var exacto = l.filter(function (x) { return JSON.stringify(x.args) === JSON.stringify(args); })[0];
      if (exacto) return exacto;
      var parecidos = l.filter(function (x) {
        if (x.args.length !== args.length) return false;
        return x.args.every(function (v, i) { return v === args[i] || args[i] === '' || v === ''; });
      }).sort(function (a, b) { return b.t - a.t; });
      if (parecidos[0]) return parecidos[0];
      // Agenda de otro día: se muestra la más reciente de la misma persona (la pantalla dice de qué fecha es).
      if (fn === 'agenda') return l.filter(function (x) { return x.args[0] === args[0]; }).sort(function (a, b) { return b.t - a.t; })[0] || null;
      return null;
    });
  }

  function encolar(fn, args, texto) {
    var item = { id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), usuario: OFFS.usuario, fn: fn, args: args, cuando: ahoraLocal(), texto: texto };
    return put('cola', item.id, item).then(function () { PEND++; return item; });
  }

  function itemsDia(planId) {
    return guardados('diaCaptura').then(function (l) {
      return l.filter(function (x) { return x.data && (x.data.items || []).some(function (it) { return it.id === planId; }); }).sort(function (a, b) { return b.t - a.t; });
    });
  }

  function num(v) { return v === '' || v === null || v === undefined || isNaN(Number(v)) ? v : Number(v); }

  var ESCRIBIR = {
    guardarResultado: function (a) {
      var planId = a[1], d = a[2] || {};
      return itemsDia(planId).then(function (l) {
        if (!l.length) throw new Error('Sin conexión: esta salida no está en el respaldo de este equipo.');
        var it0 = l[0].data.items.filter(function (it) { return it.id === planId; })[0];
        var texto = 'Resultado de ' + (it0.localidad || 'la comunidad') + ' (' + (l[0].args[1] || '') + ')';
        return encolar('guardarResultado', a.slice(1), texto).then(function () {
          return Promise.all(l.map(function (x) {
            x.data.items.forEach(function (it) {
              if (it.id !== planId) return;
              var r = Object.assign({}, it.res || {});
              Object.keys(d).forEach(function (k) { if (k !== 'insumos') r[k] = num(d[k]); });
              r.obs = d.obs || '';
              it.res = r; it.estado = 'Realizada'; it.offline = true;
              if (d.insumos && it.insumos) it.insumos.forEach(function (s) { if (d.insumos[s.id] !== undefined) s.usado = Number(d.insumos[s.id]) || 0; });
            });
            x.t = Date.now();
            return put('resp', claveResp(x.usuario, x.fn, x.args), x);
          })).then(function () { return l[0].data; });
        });
      });
    },
    narMedirCaptura: function (a) {
      var of = a[1], f = a[2] || {};
      return buscar('capturaNar', [of, f.fecha]).then(function (x) {
        if (!x) throw new Error('Sin conexión: los niños NAR de ese día no están en el respaldo.');
        var nombre = '';
        Object.keys(x.data.porPlan || {}).forEach(function (k) {
          (x.data.porPlan[k] || []).forEach(function (c) {
            if (c.folio !== f.folio) return;
            nombre = c.nombre;
            c.medida = { fecha: f.fecha, peso: num(f.peso), talla: num(f.talla), edema: f.edema, hb: num(f.hb), obs: f.obs || '', offline: true };
          });
        });
        return encolar('narMedirCaptura', a.slice(1), 'Peso NAR de ' + (nombre || f.folio) + ' (' + f.fecha + ')').then(function () {
          x.t = Date.now();
          return put('resp', claveResp(x.usuario, x.fn, x.args), x).then(function () { return { eval: { visita: 'se enviará al reconectar' }, captura: x.data }; });
        });
      });
    },
    embControlCaptura: function (a) {
      var of = a[1], f = a[2] || {};
      return buscar('embCaptura', [of, f.fecha]).then(function (x) {
        if (!x) throw new Error('Sin conexión: las embarazadas de ese día no están en el respaldo.');
        var nombre = '', sem = '';
        Object.keys(x.data.porPlan || {}).forEach(function (k) {
          (x.data.porPlan[k] || []).forEach(function (e) {
            if (e.id !== f.emb) return;
            nombre = e.nombre; sem = e.semanas;
            e.control = { peso: num(f.peso), hb: num(f.hb), hbClase: '', senales: (f.senales || []).length, offline: true };
          });
        });
        return encolar('embControlCaptura', a.slice(1), 'Control de embarazada ' + (nombre || '') + ' (' + f.fecha + ')').then(function () {
          x.t = Date.now();
          return put('resp', claveResp(x.usuario, x.fn, x.args), x).then(function () { return { control: { semanas: sem + ' · se enviará al reconectar' }, alertas: [], captura: x.data }; });
        });
      });
    },
    marcarAvisoCambio: function (a) {
      return encolar('marcarAvisoCambio', a.slice(1), 'Aviso de cambio de día').then(function () { return { id: a[2], aviso: a[3] }; });
    },
    subirFotoSalida: function (a) {
      var planId = a[1];
      return todos('cola').then(function (l) {
        var fotos = (l || []).filter(function (x) { return x.fn === 'subirFotoSalida'; });
        if (fotos.length >= MAX_FOTOS_COLA) throw new Error('Sin conexión ya no caben más fotos en este equipo. Súbelas al volver la señal.');
        if (fotos.filter(function (x) { return x.args[0] === planId; }).length >= MAX_FOTOS_PLAN) throw new Error('Ya hay ' + MAX_FOTOS_PLAN + ' fotos de esta salida esperando señal.');
        return itemsDia(planId).then(function (dl) {
          var it = dl.length ? dl[0].data.items.filter(function (y) { return y.id === planId; })[0] : null;
          return encolar('subirFotoSalida', a.slice(1), 'Foto de ' + (it ? it.localidad : 'la salida')).then(function () { return fotosInfo(planId); });
        });
      });
    }
  };

  function fotosInfo(planId) {
    return Promise.all([todos('cola'), itemsDia(planId)]).then(function (r) {
      var n = (r[0] || []).filter(function (x) { return x.fn === 'subirFotoSalida' && x.args[0] === planId; }).length;
      var it = r[1].length ? r[1][0].data.items.filter(function (y) { return y.id === planId; })[0] : null;
      return { n: n, max: MAX_FOTOS_PLAN, url: '', localidad: (it ? it.localidad : '') + ' (sin conexión: se suben al volver la señal)', visita: it ? it.visita : '' };
    });
  }

  window.ukaOffLlamar = function (fn, argsTxt) {
    var a = [];
    try { a = JSON.parse(argsTxt); } catch (e) { a = []; }
    var salida = function (v) { return v === undefined ? undefined : JSON.stringify(v); };
    if (!OFFS) return Promise.reject('Sin conexión.');
    if (fn === 'paqueteModulos') return Promise.resolve(salida(OFFS.paq.modulos));
    if (fn === 'logoApp') return Promise.resolve(salida(OFFS.paq.logo || ''));
    if (fn === 'continuar') { var p = JSON.parse(JSON.stringify(OFFS.perfil)); p.hoy = hoyLocal(); p.offline = true; return Promise.resolve(salida(p)); }
    if (fn === 'entrar') return Promise.reject('Sin conexión solo se puede usar la sesión que ya estaba abierta en este equipo.');
    if (fn === 'salir') return Promise.resolve(undefined);
    if (fn === 'fotosSalida') return fotosInfo(a[1]).then(salida);
    if (ESCRITURAS[fn]) {
      if (OFFS.rol !== 'campo') return Promise.reject('Sin conexión: esta acción necesita internet.');
      return ESCRIBIR[fn](a).then(salida, function (e) { throw String((e && e.message) || e); });
    }
    return buscar(fn, a.slice(1)).then(function (x) {
      if (!x) throw 'Sin conexión: esta información no está guardada en este equipo. Ábrela con internet para tenerla después.';
      return salida(x.data);
    });
  };
})();
