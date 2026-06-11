import React from 'react';
import kubikLogo from '../assets/kubik-logo-transparent.png';

function StudentBrandMark({ variant = 'hero' }) {
  return (
    <div className={`student-brand student-brand--${variant}`} aria-label="KUBIK">
      <img src={kubikLogo} alt="" className="student-brand-logo" />
    </div>
  );
}

export default StudentBrandMark;
