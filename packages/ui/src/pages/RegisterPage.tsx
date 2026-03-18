import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import {
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Link,
  Text,
  TextField,
} from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { auth } from '../firebase';
import type { RegisterRequest, RegisterResponse } from '@muvat/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function RegisterPage() {
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Le password non corrispondono');
      return;
    }

    setLoading(true);
    try {
      const body: RegisterRequest = { email, password, tenantName };
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `Errore ${res.status}`);
      }

      await res.json() as RegisterResponse;
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante la registrazione');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100svh' }} p="4">
      <Box style={{ width: '100%', maxWidth: 420 }}>
        <Flex direction="column" align="center" gap="1" mb="6">
          <Heading size="7" style={{ letterSpacing: '-0.5px' }}>Muvat</Heading>
          <Text size="2" color="gray">Crea il tuo spazio tenant</Text>
        </Flex>

        <Card size="4">
          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" weight="medium" htmlFor="tenantName">Nome azienda</Text>
                <Box mt="1">
                  <TextField.Root
                    id="tenantName"
                    type="text"
                    placeholder="es. Ginepro SRL"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    required
                    size="3"
                  />
                </Box>
              </Box>

              <Box>
                <Text as="label" size="2" weight="medium" htmlFor="reg-email">Email</Text>
                <Box mt="1">
                  <TextField.Root
                    id="reg-email"
                    type="email"
                    placeholder="nome@azienda.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    size="3"
                  />
                </Box>
              </Box>

              <Box>
                <Text as="label" size="2" weight="medium" htmlFor="reg-password">Password</Text>
                <Box mt="1">
                  <TextField.Root
                    id="reg-password"
                    type="password"
                    placeholder="Minimo 8 caratteri"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    size="3"
                  />
                </Box>
              </Box>

              <Box>
                <Text as="label" size="2" weight="medium" htmlFor="confirm">Conferma password</Text>
                <Box mt="1">
                  <TextField.Root
                    id="confirm"
                    type="password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    size="3"
                  />
                </Box>
              </Box>

              {error && (
                <Callout.Root color="red" variant="soft" size="1">
                  <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
                  <Callout.Text>{error}</Callout.Text>
                </Callout.Root>
              )}

              <Button type="submit" disabled={loading} size="3" mt="1">
                {loading ? 'Registrazione in corso…' : 'Crea account'}
              </Button>
            </Flex>
          </form>
        </Card>

        <Text size="2" color="gray" align="center" mt="4" as="p">
          Hai già un account?{' '}
          <Link asChild size="2"><RouterLink to="/login">Accedi</RouterLink></Link>
        </Text>
      </Box>
    </Flex>
  );
}
