import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import { Web3Provider } from './contexts/Web3Context';
import { AuthProvider } from './contexts/AuthContext';

ReactDOM.render(
  <React.StrictMode>
    <Web3Provider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Web3Provider>
  </React.StrictMode>,
  document.getElementById('root')
); 