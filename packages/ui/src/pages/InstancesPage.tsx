import { useState, useEffect, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Container,
  Dialog,
  Flex,
  Heading,
  Link,
  Spinner,
  Text,
  TextField,
} from '@radix-ui/themes';
import {
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
} from '@radix-ui/react-icons';
import { AppShell } from '../components/AppShell';
import { CopyableValue } from '../components/CopyableValue';
import { useAuth } from '../contexts/AuthContext';
import type {
  CreateInstanceRequest,
  CreateInstanceResponse,
  SatispayInstance,
} from '@muvat/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

function instanceStatusColor(status?: SatispayInstance['credentialsStatus']): 'red' | 'amber' | 'gray' {
  switch (status) {
    case 'key_mismatch':
      return 'red';
    case 'unavailable':
      return 'amber';
    default:
      return 'gray';
  }
}

function instanceStatusLabel(status?: SatispayInstance['credentialsStatus']): string | null {
  switch (status) {
    case 'key_mismatch':
      return 'Da ricreare';
    case 'unavailable':
      return 'Credenziali assenti';
    default:
      return null;
  }
}

export function InstancesPage() {
  const { token } = useAuth();
  const [instances, setInstances] = useState<Omit<SatispayInstance, 'tenantId'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchInstances = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/instances`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInstances(await res.json());
    } catch {
      setError('Impossibile caricare le istanze.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchInstances();
  }, [token]);

  const handleDelete = async (instanceId: string) => {
    if (!confirm("Eliminare questa istanza? L'operazione è irreversibile.")) return;
    await fetch(`${API_BASE}/instances/${instanceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchInstances();
  };

  return (
    <AppShell>
      <Container size="3" py="8">
        <Flex align="center" justify="between" mb="5">
          <Heading size="6">Istanze Satispay</Heading>
          <Button size="2" onClick={() => setShowForm(true)}>
            <PlusIcon /> Nuova istanza
          </Button>
        </Flex>

        {error && (
          <Callout.Root color="red" mb="4">
            <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {loading ? (
          <Flex align="center" justify="center" py="9">
            <Spinner size="3" />
          </Flex>
        ) : instances.length === 0 ? (
          <Card size="3">
            <Flex direction="column" align="center" gap="4" py="6">
              <Text color="gray">Nessuna istanza configurata.</Text>
              <Button onClick={() => setShowForm(true)}>
                <PlusIcon /> Aggiungi la prima istanza
              </Button>
            </Flex>
          </Card>
        ) : (
          <Flex direction="column" gap="2">
            {instances.map((inst) => (
              <Card key={inst.id} size="2">
                <Flex align="center" justify="between">
                  <Flex direction="column" gap="1">
                    <Text size="3" weight="medium">{inst.label}</Text>
                    <Flex gap="2" align="center">
                      <CopyableValue value={inst.keyId} head={1} tail={1} />
                      {instanceStatusLabel(inst.credentialsStatus) && (
                        <Badge variant="soft" color={instanceStatusColor(inst.credentialsStatus)} size="1">
                          {instanceStatusLabel(inst.credentialsStatus)}
                        </Badge>
                      )}
                      <Text size="1" color="gray">
                        {new Date(inst.createdAt).toLocaleDateString('it-IT')}
                      </Text>
                    </Flex>
                  </Flex>
                  <Flex gap="2">
                    <Button size="1" variant="soft" asChild>
                      <RouterLink to={`/instances/${inst.id}`}>Dettaglio</RouterLink>
                    </Button>
                    <Button
                      size="1"
                      color="red"
                      variant="soft"
                      onClick={() => handleDelete(inst.id)}
                    >
                      <TrashIcon /> Elimina
                    </Button>
                  </Flex>
                </Flex>
              </Card>
            ))}
          </Flex>
        )}

        <Dialog.Root open={showForm} onOpenChange={setShowForm}>
          <Dialog.Content maxWidth="460px">
            <CreateInstanceForm
              token={token!}
              apiBase={API_BASE}
              onCreated={() => { setShowForm(false); fetchInstances(); }}
            />
          </Dialog.Content>
        </Dialog.Root>
      </Container>
    </AppShell>
  );
}

interface FormProps {
  token: string;
  apiBase: string;
  onCreated: () => void;
}

function CreateInstanceForm({ token, apiBase, onCreated }: FormProps) {
  const [label, setLabel] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body: CreateInstanceRequest = { label, activationCode };
      const res = await fetch(`${apiBase}/instances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await res.json() as CreateInstanceResponse;
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante la creazione.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog.Title>Nuova istanza Satispay</Dialog.Title>
      <Dialog.Description size="2" color="gray" mb="4">
        Ottieni il codice di attivazione dal{' '}
        <Link href="https://business.satispay.com" target="_blank" rel="noreferrer">
          pannello business Satispay
        </Link>.
      </Dialog.Description>

      <form onSubmit={handleSubmit}>
        <Flex direction="column" gap="4">
          <Box>
            <Text as="label" size="2" weight="medium" htmlFor="inst-label">Nome cassa</Text>
            <Box mt="1">
              <TextField.Root
                id="inst-label"
                placeholder="es. Cassa principale"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                size="3"
              />
            </Box>
          </Box>

          <Box>
            <Text as="label" size="2" weight="medium" htmlFor="activation-code">
              Codice di attivazione
            </Text>
            <Box mt="1">
              <TextField.Root
                id="activation-code"
                placeholder="XXXXXX"
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value.trim())}
                required
                size="3"
              />
            </Box>
            <Text as="p" size="1" color="gray" mt="1">
              Il codice e monouso. Se stai provando Satispay sandbox, il server deve usare
              {' '}
              <code>SATISPAY_ENV=sandbox</code>.
            </Text>
          </Box>

          {error && (
            <Callout.Root color="red" variant="soft" size="1">
              <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          <Flex gap="2" justify="end" mt="2">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray">
                Annulla
              </Button>
            </Dialog.Close>
            <Button type="submit" disabled={loading}>
              {loading ? 'Registrazione in corso…' : 'Crea istanza'}
            </Button>
          </Flex>
        </Flex>
      </form>
    </>
  );
}
