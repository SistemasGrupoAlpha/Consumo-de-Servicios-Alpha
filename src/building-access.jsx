import React, { useEffect, useState } from 'react';
import { Building2, Save } from 'lucide-react';

export function BuildingAccess({ request, buildings, buildingsError, reloadBuildings }) {
  const [users, setUsers] = useState(null);
  const [usuario, setUsuario] = useState('');
  const [saved, setSaved] = useState(null);
  const [checked, setChecked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [usersError, setUsersError] = useState('');
  const [error, setError] = useState('');
  const [attempt, retry] = useState(0);
  const [userAttempt, retryUsers] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request('/api/users', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setUsers(result.users.filter(user => user.rol !== 'Admin')
        .sort((first, second) => first.nombre.localeCompare(second.nombre, 'es')));
    }, reason => { if (!controller.signal.aborted) setUsersError(reason.message); });
    return () => controller.abort();
  }, [request, userAttempt]);

  useEffect(() => {
    if (!usuario) return;
    const controller = new AbortController();
    request(`/api/building-access?usuario=${encodeURIComponent(usuario)}`, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setSaved(result);
      setChecked(result.buildings);
    }, reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [request, usuario, attempt]);

  function changeUser(value) {
    setUsuario(value);
    setSaved(null);
    setChecked([]);
    setError('');
    setNotice('');
  }

  function reloadAccess() {
    setSaved(null);
    setError('');
    setNotice('');
    retry(value => value + 1);
  }

  function toggle(id, selected) {
    setNotice('');
    setError('');
    setChecked(current => selected ? [...current, id] : current.filter(value => value !== id));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/building-access', {
        method: 'POST',
        body: JSON.stringify({ usuario, buildings: checked, revision: saved.revision }),
      });
      setSaved(result);
      setChecked(result.buildings);
      setNotice('Accesos actualizados.');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  const modified = saved && (checked.length !== saved.buildings.length || checked.some(id => !saved.buildings.includes(id)));
  return <form className="panel building-access" onSubmit={save}>
    <fieldset disabled={busy}>
      {usersError && <p className="error" role="alert">{usersError} <button type="button" className="secondary" onClick={() => {
        setUsersError('');
        retryUsers(value => value + 1);
      }}>Reintentar</button></p>}
      {users?.length ? <div className="building-access-user">
        <label htmlFor="building-access-user">Usuario</label>
        <select id="building-access-user" value={usuario} onChange={event => changeUser(event.target.value)}>
          <option value="">Seleccioná un usuario</option>
          {users.map(user => <option key={user.usuario} value={user.usuario}>
            {user.nombre === user.usuario ? user.usuario : `${user.nombre} (${user.usuario})`}{user.activo === false ? ' · Inactivo' : ''}
          </option>)}
        </select>
      </div> : !usersError && <p role="status">{users ? 'No hay usuarios para asignar.' : 'Cargando usuarios…'}</p>}
      {usuario && <>
        {error && <p className="error" role="alert">{error} <button type="button" className="secondary" onClick={reloadAccess}>Recargar accesos</button></p>}
        {!saved && !error && <p role="status">Cargando accesos del usuario…</p>}
        {saved && <>
          {buildingsError && <p className="error" role="alert">{buildingsError} <button type="button" className="secondary" onClick={reloadBuildings}>Reintentar</button></p>}
          {buildings?.length ? <>
            <fieldset className="reading-step building-access-options">
              <legend>Edificios con acceso</legend>
              <div className="reading-choices reading-buildings">
                {buildings.map(building => <label key={building.id} className="reading-choice">
                  <input type="checkbox" checked={checked.includes(building.id)} onChange={event => toggle(building.id, event.target.checked)}/>
                  <Building2 size={19} aria-hidden="true"/>
                  <span>{building.Title}</span>
                </label>)}
              </div>
            </fieldset>
            <button className="primary reading-submit" type="submit" disabled={!modified || Boolean(error)}><Save size={16}/>{busy ? 'Guardando…' : 'Guardar accesos'}</button>
          </> : !buildingsError && <p role="status">{buildings ? 'No hay edificios disponibles.' : 'Cargando edificios…'}</p>}
        </>}
        {notice && <p className="reading-saved" role="status">{notice}</p>}
      </>}
    </fieldset>
  </form>;
}
