import React from 'react';

function ConnectWallet({ onConnect }) {
  return (
    <div className="connect-wallet">
      <button className="connect-button" onClick={onConnect}>
        Connect Wallet
      </button>
    </div>
  );
}

export default ConnectWallet;