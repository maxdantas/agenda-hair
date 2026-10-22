import React, { useState } from 'react';
import { Scissors, Lock, Mail, ArrowRight, ShieldCheck, Sparkles, Eye, EyeOff } from 'lucide-react';
import { api, setStoredToken } from '../api';
import type { AuthUser } from '../../shared/types';

interface LoginViewProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(email.trim(), password);
      setStoredToken(res.token);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError('');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(150deg, #161514 0%, #211E1C 55%, #161514 100%)',
        color: '#F4F1EA',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 450 }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #B86B48, #8A492B)',
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 28px rgba(158, 90, 60, 0.35)',
              marginBottom: 14,
            }}
          >
            <Scissors size={26} />
          </div>

          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 34,
              fontWeight: 400,
              color: '#FFFFFF',
              lineHeight: 1.1,
              letterSpacing: '0.01em',
            }}
          >
            Agenda Hair
          </div>
          <p style={{ fontSize: 13, color: '#A8A096', marginTop: 6 }}>
            Plataforma SaaS de Gestão para Salões de Beleza e Barbearias
          </p>
        </div>

        {/* Main Login Card */}
        <div
          style={{
            background: '#FFFFFF',
            color: 'var(--ink-primary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            padding: '28px 26px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink-primary)' }}>
              Acesso ao Sistema
            </h2>
            <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginTop: 3 }}>
              Entre com suas credenciais do painel do estabelecimento ou da administração.
            </p>
          </div>

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--status-danger-bg)',
                border: '1px solid #EABDBD',
                color: 'var(--status-danger)',
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div className="field">
              <label>E-mail de Acesso</label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--ink-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  style={{ paddingLeft: 36, height: 42 }}
                />
              </div>
            </div>

            <div className="field">
              <label>Senha</label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--ink-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ paddingLeft: 36, paddingRight: 38, height: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--ink-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 4,
                  }}
                  title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: '100%',
                height: 44,
                fontSize: 14,
                fontWeight: 700,
                marginTop: 4,
                background: '#9E5A3C',
                borderColor: '#9E5A3C',
              }}
            >
              {loading ? (
                <span>Autenticando...</span>
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials Box */}
          <div
            style={{
              marginTop: 22,
              paddingTop: 18,
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                color: 'var(--ink-secondary)',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Sparkles size={14} style={{ color: '#9E5A3C' }} />
              <span>Acessos Rápidos (Clique para preencher)</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* SuperAdmin Demo Button */}
              <button
                type="button"
                onClick={() => quickFill('admin@agendahair.com', '123456')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: '#F4EFF8',
                  border: '1px solid #D7C4E3',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: '#5E3B73',
                      color: '#FFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <ShieldCheck size={17} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#3E234E' }}>
                      Painel de Administrador (Você / Equipe)
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: '#5E3B73' }}>
                      admin@agendahair.com • Senha: 123456
                    </div>
                  </div>
                </div>
                <span className="badge badge-fitin" style={{ flexShrink: 0 }}>
                  Admin SaaS
                </span>
              </button>

              {/* Salon Client #1 Demo Button */}
              <button
                type="button"
                onClick={() => quickFill('contato@ateliernobre.com', '123456')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: '#FDF4E7',
                  border: '1px solid #F0D2A8',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: '#9E5A3C',
                      color: '#FFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Scissors size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#6E381F' }}>
                      Painel do Cabeleireiro (Cliente #1)
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: '#8A500D' }}>
                      contato@ateliernobre.com • Senha: 123456
                    </div>
                  </div>
                </div>
                <span className="badge badge-progress" style={{ flexShrink: 0 }}>
                  Cliente Salão
                </span>
              </button>

              {/* Barbershop Client #2 Demo Button */}
              <button
                type="button"
                onClick={() => quickFill('contato@barbeariadompedro.com', '123456')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: '#2D3A3A',
                      color: '#FFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Scissors size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-primary)' }}>
                      Barbearia Dom Pedro (Cliente #2)
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>
                      contato@barbeariadompedro.com • Senha: 123456
                    </div>
                  </div>
                </div>
                <span className="badge badge-scheduled" style={{ flexShrink: 0 }}>
                  Barbearia
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

