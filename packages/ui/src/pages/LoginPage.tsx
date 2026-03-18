import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, Navigate } from 'react-router-dom';
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
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { signIn, user, tenantId, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user && tenantId) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Email o password non corretti');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100svh' }} p="4">
      <Box style={{ width: '100%', maxWidth: 400 }}>
        <Flex direction="column" align="center" gap="1" mb="6">
          <Heading size="7" style={{ letterSpacing: '-0.5px' }}>Muvat</Heading>
          <Text size="2" color="gray">Accedi al tuo account</Text>
        </Flex>

        <Card size="4">
          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" weight="medium" htmlFor="email">Email</Text>
                <Box mt="1">
                  <TextField.Root
                    id="email"
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
                <Text as="label" size="2" weight="medium" htmlFor="password">Password</Text>
                <Box mt="1">
                  <TextField.Root
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
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

              <Button type="submit" disabled={submitting} size="3" mt="1">
                {submitting ? 'Accesso in corso…' : 'Accedi'}
              </Button>
            </Flex>
          </form>
        </Card>

        <Text size="2" color="gray" align="center" mt="4" as="p">
          Non hai un account?{' '}
          <Link asChild size="2"><RouterLink to="/register">Registrati</RouterLink></Link>
        </Text>
      </Box>
    </Flex>
  );
}
