import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { AlphaLogo } from './brand';

export function PortalLogin({ login, setLogin, onSubmit, onDemo, busy, error }) {
  const [showPassword, setShowPassword] = useState(false);
  const PasswordIcon = showPassword ? EyeOff : Eye;
  return <main className="portal-login">
    <div className="portal-login-brand">
      <AlphaLogo/>
      <div className="portal-login-intro">
        <h1>Consumo<br className="login-title-break"/> de Servicios</h1>
        <p>Registro y seguimiento de agua y energía por edificio.</p>
      </div>
    </div>
    <div className="portal-login-content">
      <section className="portal-login-form" aria-labelledby="login-heading">
        <h2 id="login-heading">Iniciar sesión</h2>
        <p>Ingresá con tu cuenta para abrir la plataforma.</p>
        <form onSubmit={onSubmit}>
          <label htmlFor="login-username">Usuario o correo</label>
          <input id="login-username" required autoComplete="username" autoCapitalize="none" spellCheck={false}
            value={login.usuario} onChange={event => setLogin({ ...login, usuario: event.target.value })}/>
          <label htmlFor="login-password">Contraseña</label>
          <div className="portal-password">
            <input id="login-password" required type={showPassword ? 'text' : 'password'} autoComplete="current-password"
              value={login.password} onChange={event => setLogin({ ...login, password: event.target.value })}/>
            <button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              onClick={() => setShowPassword(visible => !visible)}><PasswordIcon size={18}/></button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="primary portal-login-submit" disabled={busy}>
            {busy ? 'Ingresando…' : 'Ingresar'}<ArrowRight size={18} aria-hidden="true"/>
          </button>
          {onDemo && <>
            <button type="button" className="secondary" onClick={onDemo}>Entrar en modo demostración</button>
            <p className="portal-login-demo">La demostración usa datos ficticios.</p>
          </>}
        </form>
      </section>
    </div>
  </main>;
}
