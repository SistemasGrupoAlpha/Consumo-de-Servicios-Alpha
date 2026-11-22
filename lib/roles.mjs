export const SUPER_ADMIN = 'Admin';
export const CONDO_ADMIN = 'Administrador de condominios';
export const OPERATOR = 'Usuario';

export const roleOptions = [
  [SUPER_ADMIN, 'Super Admin'],
  [CONDO_ADMIN, CONDO_ADMIN],
  [OPERATOR, OPERATOR],
];

export function normalizeRole(value) {
  const role = String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (['admin', 'super admin', 'superadmin', 'super administrador'].includes(role)) return SUPER_ADMIN;
  if (['administrador de condominios', 'administrador de condominio'].includes(role)) return CONDO_ADMIN;
  return OPERATOR;
}

export function canReport(role) {
  return role === SUPER_ADMIN || role === CONDO_ADMIN;
}
