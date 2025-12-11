
import { supabase } from './supabaseClient';
import { AdminUser } from '../types';

export const authService = {
  // Login seguro via Supabase Auth
  async signIn(email: string, password: string): Promise<{ user: any; error: any }> {
    if (!supabase) return { user: null, error: 'Modo Offline' };
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { user: data.user, error };
  },

  // Logout
  async signOut() {
    if (supabase) await supabase.auth.signOut();
  },

  // Pegar usuário atual da sessão
  async getCurrentUser() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user;
  },

  // Verificar permissão no banco 'users' (Role: MASTER vs BASIC)
  async getUserRole(email: string): Promise<string> {
      if (!supabase) return 'BASIC';
      
      try {
          // Busca na tabela pública 'users' onde o JSON 'data' contém o email exato
          const { data } = await supabase
            .from('users')
            .select('*')
            .contains('data', { email: email }) // Busca exata dentro do JSON
            .single();
            
          if (data && data.data && data.data.role) {
              return data.data.role;
          }
          
          // Fallback: Tenta buscar pelo username (parte antes do @) caso o email não esteja no JSON
          const username = email.split('@')[0];
          const { data: dataByUsername } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

          if (dataByUsername && dataByUsername.data && dataByUsername.data.role) {
              return dataByUsername.data.role;
          }

      } catch (e) {
          console.error("Erro ao buscar role:", e);
      }
      return 'BASIC'; 
  }
};
