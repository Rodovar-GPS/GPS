
import React, { useState } from 'react';
import { authService } from '../services/authService';

interface LoginPanelProps {
  onLoginSuccess: (username: string) => void;
  onCancel: () => void;
}

const LoginPanel: React.FC<LoginPanelProps> = ({ onLoginSuccess, onCancel }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
        // Lógica de Login:
        // Se o usuário digitar um email completo (ex: jbvive@gmail.com), usa ele.
        // Se digitar apenas o nome (ex: admin), adiciona o domínio padrão da empresa.
        let emailToUse = email.trim();
        if (!emailToUse.includes('@')) {
            emailToUse = `${emailToUse}@rodovar.com`;
        }

        const { user, error } = await authService.signIn(emailToUse, password);
        
        if (error) {
           console.error(error);
           setError('Credenciais inválidas. Verifique Email e Senha.');
        } else if (user) {
           // Login sucesso
           const displayUser = user.email ? user.email : 'Admin';
           onLoginSuccess(displayUser);
        }
    } catch (err) {
        setError('Erro ao conectar ao sistema.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 animate-[fadeIn_0.3s]">
      <div className="w-full max-w-md bg-rodovar-gray border border-gray-700 rounded-xl p-8 shadow-2xl relative">
        <button 
            onClick={onCancel}
            className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
            ✕
        </button>
        
        <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-rodovar-white">Acesso Corporativo Seguro</h2>
            <p className="text-gray-400 text-sm mt-1">Entre com suas credenciais (SSO/Email)</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs text-rodovar-yellow uppercase font-bold mb-2">Email Corporativo</label>
            <input 
              type="text" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-rodovar-black border border-gray-600 rounded-lg p-3 text-rodovar-white focus:border-rodovar-yellow focus:ring-1 focus:ring-rodovar-yellow outline-none transition-all"
              placeholder="ex: seu.nome@gmail.com ou admin"
            />
          </div>

          <div>
            <label className="block text-xs text-rodovar-yellow uppercase font-bold mb-2">Senha</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-rodovar-black border border-gray-600 rounded-lg p-3 text-rodovar-white focus:border-rodovar-yellow focus:ring-1 focus:ring-rodovar-yellow outline-none transition-all"
              placeholder="••••••"
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center font-bold bg-red-900/20 py-2 rounded border border-red-500/30">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-rodovar-yellow text-black font-bold py-3 rounded-lg hover:bg-yellow-400 transition-colors shadow-[0_0_10px_rgba(255,215,0,0.2)] disabled:opacity-50 uppercase tracking-widest"
          >
            {loading ? 'AUTENTICANDO...' : 'ACESSAR SISTEMA'}
          </button>
          
          <div className="text-center mt-4">
              <p className="text-[10px] text-gray-500">
                  Protegido por Supabase Security. <br/>
                  Se não tiver conta, contate o administrador Master.
              </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPanel;
