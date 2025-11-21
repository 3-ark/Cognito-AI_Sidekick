import React from 'react';

interface FabProps {
  onClick: () => void;
}

const Fab: React.FC<FabProps> = ({ onClick }) => {
  return (
    <button id="cognito-fab" onClick={onClick}>
      <img src={chrome.runtime.getURL('assets/images/cognito.png')} alt="Cognito" />
    </button>
  );
};

export default Fab;
