import React from 'react';
import alphaLogo from './assets/alpha.avif';

export function AlphaLogo({ className = '' }) {
  return <span className={`alpha-wordmark ${className}`}><img src={alphaLogo} alt="Grupo Alpha" width="768" height="432"/></span>;
}
