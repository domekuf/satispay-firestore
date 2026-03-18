import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CheckIcon,
  ClipboardCopyIcon,
  ExclamationTriangleIcon,
  Link2Icon,
  PlusIcon,
  ReloadIcon,
} from '@radix-ui/react-icons';
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Code,
  Container,
  Dialog,
  Flex,
  Grid,
  Heading,
  Inset,
  Separator,
  Spinner,
  Text,
  TextField,
} from '@radix-ui/themes';
import { AppShell } from '../components/AppShell';
import { CopyableValue } from '../components/CopyableValue';
import { useAuth } from '../contexts/AuthContext';
import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
  InstanceCredentialsStatus,
  Payment,
  SatispayInstance,
} from '@muvat/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const PAYMENT_API_SEGMENT = 'payment';

function buildAbsoluteApiUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/, '');
  if (API_BASE) {
    return `${API_BASE.replace(/\/+$/, '')}/${normalizedPath}`;
  }
  return new URL(normalizedPath, window.location.origin).toString();
}

function formatDate(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('it-IT');
}

function formatAmount(amountUnit: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amountUnit / 100);
}

function statusColor(status: Payment['status']): 'gray' | 'green' | 'red' | 'amber' {
  switch (status) {
    case 'ACCEPTED':
      return 'green';
    case 'CANCELED':
      return 'red';
    case 'EXPIRED':
      return 'amber';
    default:
      return 'gray';
  }
}

function credentialsBadgeColor(status?: InstanceCredentialsStatus): 'green' | 'red' | 'amber' | 'gray' {
  switch (status) {
    case 'ok':
      return 'green';
    case 'key_mismatch':
      return 'red';
    case 'unavailable':
      return 'amber';
    default:
      return 'gray';
  }
}

function credentialsBadgeLabel(status?: InstanceCredentialsStatus): string {
  switch (status) {
    case 'ok':
      return 'Credenziali OK';
    case 'key_mismatch':
      return 'Chiave non decifrabile';
    case 'unavailable':
      return 'Credenziali non disponibili';
    default:
      return 'Stato sconosciuto';
  }
}

export function InstanceDetailPage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const { token } = useAuth();
  const [instance, setInstance] = useState<SatispayInstance | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreatePayment, setShowCreatePayment] = useState(false);

  const canCreatePayments = instance?.credentialsStatus === 'ok';

  const createPaymentUrl = useMemo(() => {
    if (!instanceId) return '';
    return buildAbsoluteApiUrl(`${PAYMENT_API_SEGMENT}/${instanceId}`);
  }, [instanceId]);

  const paymentStatusUrl = useMemo(() => {
    if (!instanceId) return '';
    return buildAbsoluteApiUrl(`${PAYMENT_API_SEGMENT}/${instanceId}/{paymentId}`);
  }, [instanceId]);

  const fetchData = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!token || !instanceId) return;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [instanceRes, paymentsRes] = await Promise.all([
        fetch(`${API_BASE}/instances/${instanceId}`, { headers }),
        fetch(`${API_BASE}/instances/${instanceId}/payments`, { headers }),
      ]);

      if (!instanceRes.ok) {
        const data = await instanceRes.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${instanceRes.status}`);
      }

      if (!paymentsRes.ok) {
        const data = await paymentsRes.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${paymentsRes.status}`);
      }

      setInstance(await instanceRes.json() as SatispayInstance);
      setPayments(await paymentsRes.json() as Payment[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile caricare il dettaglio istanza.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [token, instanceId]);

  if (!instanceId) {
    return (
      <AppShell>
        <Container size="3" py="8">
          <Callout.Root color="red">
            <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
            <Callout.Text>ID istanza mancante.</Callout.Text>
          </Callout.Root>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container size="4" py="8">
        <Flex direction="column" gap="5">
          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <Box>
              <Button variant="ghost" color="gray" size="1" asChild mb="2">
                <RouterLink to="/instances">
                  <ArrowLeftIcon /> Torna alle istanze
                </RouterLink>
              </Button>
              <Heading size="6">{instance?.label ?? 'Dettaglio istanza'}</Heading>
              {instance && (
                <Flex gap="2" align="center" mt="2" wrap="wrap">
                  <CopyableValue value={instance.keyId} head={1} tail={1} />
                  <Badge variant="soft" color={credentialsBadgeColor(instance.credentialsStatus)} size="1">
                    {credentialsBadgeLabel(instance.credentialsStatus)}
                  </Badge>
                  <Text size="1" color="gray">
                    Creata il {formatDate(instance.createdAt)}
                  </Text>
                </Flex>
              )}
            </Box>

            <Flex gap="2" wrap="wrap">
              <Button variant="soft" color="gray" onClick={() => void fetchData('refresh')} disabled={refreshing || loading}>
                <ReloadIcon />
                {refreshing ? 'Aggiornamento…' : 'Aggiorna'}
              </Button>
              <Button onClick={() => setShowCreatePayment(true)} disabled={Boolean(instance && !canCreatePayments)}>
                <PlusIcon /> Nuovo pagamento manuale
              </Button>
            </Flex>
          </Flex>

          {instance && instance.credentialsStatus !== 'ok' && (
            <Callout.Root color={instance.credentialsStatus === 'key_mismatch' ? 'red' : 'amber'}>
              <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
              <Callout.Text>
                {instance.credentialsError ?? 'Le credenziali di questa istanza non sono disponibili.'}
                {' '}
                Finche questa situazione non viene risolta, la creazione dei pagamenti resta disabilitata.
              </Callout.Text>
            </Callout.Root>
          )}

          {error && (
            <Callout.Root color="red">
              <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          {loading ? (
            <Flex align="center" justify="center" py="9">
              <Spinner size="3" />
            </Flex>
          ) : (
            <>
              <Grid columns={{ initial: '1', md: '2' }} gap="4">
                <EndpointCard
                  title="Endpoint creazione pagamento"
                  description="Da usare con POST per creare un nuovo pagamento per questa istanza."
                  url={createPaymentUrl}
                />
                <EndpointCard
                  title="Endpoint stato pagamento"
                  description="Da usare con GET sostituendo {paymentId} con l'identificativo reale."
                  url={paymentStatusUrl}
                />
              </Grid>

              <Card size="3">
                <Flex align="center" justify="between" mb="4" gap="3" wrap="wrap">
                  <Box>
                    <Heading size="4">Pagamenti</Heading>
                    <Text size="2" color="gray">
                      Tutti i dettagli attualmente persistiti per questa istanza.
                    </Text>
                  </Box>
                  <Badge size="2" variant="soft" color="gray">
                    {payments.length} {payments.length === 1 ? 'pagamento' : 'pagamenti'}
                  </Badge>
                </Flex>

                {payments.length === 0 ? (
                  <Callout.Root color="gray">
                    <Callout.Icon><Link2Icon /></Callout.Icon>
                    <Callout.Text>Nessun pagamento registrato per questa istanza.</Callout.Text>
                  </Callout.Root>
                ) : (
                  <Flex direction="column" gap="3">
                    {payments.map((payment) => (
                      <PaymentCard key={payment.id} payment={payment} />
                    ))}
                  </Flex>
                )}
              </Card>
            </>
          )}
        </Flex>

        <Dialog.Root open={showCreatePayment} onOpenChange={setShowCreatePayment}>
          <Dialog.Content maxWidth="520px">
            <CreateManualPaymentForm
              token={token ?? ''}
              instanceId={instanceId}
              onCreated={async () => {
                setShowCreatePayment(false);
                await fetchData('refresh');
              }}
            />
          </Dialog.Content>
        </Dialog.Root>
      </Container>
    </AppShell>
  );
}

function EndpointCard({ title, description, url }: { title: string; description: string; url: string }) {
  return (
    <Card size="3">
      <Flex direction="column" gap="3">
        <Box>
          <Heading size="3">{title}</Heading>
          <Text size="2" color="gray">{description}</Text>
        </Box>
        <Inset>
          <CopyableValue
            value={url}
            head={1}
            tail={1}
            block
            style={{
              borderRadius: '12px',
              background: 'var(--gray-a2)',
              border: '1px solid var(--gray-a4)',
              padding: '12px',
            }}
          />
        </Inset>
      </Flex>
    </Card>
  );
}

function PaymentCard({ payment }: { payment: Payment }) {
  return (
    <Card size="2">
      <Flex direction="column" gap="3">
        <Flex align="start" justify="between" gap="3" wrap="wrap">
          <Box>
            <Text size="2" color="gray">Payment ID</Text>
            <CopyableValue value={payment.id} head={1} tail={1} />
          </Box>
          <Badge color={statusColor(payment.status)} variant="soft" size="2">
            {payment.status}
          </Badge>
        </Flex>
        <Separator size="4" />
        <Grid columns={{ initial: '1', sm: '2', md: '3' }} gap="3">
          <DetailField label="Order ID" value={payment.orderId} />
          <DetailField label="Telefono" value={payment.phoneNumber ?? '—'} />
          <DetailField label="Importo" value={formatAmount(payment.amountUnit)} />
          <DetailField label="Valuta" value={payment.currency} />
          <DetailField label="Creato il" value={formatDate(payment.createdAt)} />
          <DetailField label="Aggiornato il" value={formatDate(payment.updatedAt)} />
        </Grid>
      </Flex>
    </Card>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text size="1" color="gray">{label}</Text>
      <Text size="2" weight="medium">{value}</Text>
    </Box>
  );
}

function CreateManualPaymentForm(
  { token, instanceId, onCreated }: { token: string; instanceId: string; onCreated: () => Promise<void> | void },
) {
  const [orderId, setOrderId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPaymentId, setCreatedPaymentId] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCreatedPaymentId(null);
    try {
      const body: CreatePaymentRequest = {
        orderId,
        phoneNumber,
        price: Math.round(Number(price) * 100),
      };

      if (!body.orderId || !body.phoneNumber || !Number.isFinite(body.price) || body.price <= 0) {
        throw new Error('Compila order ID, telefono e importo valido.');
      }

      const res = await fetch(`${API_BASE}/${PAYMENT_API_SEGMENT}/${instanceId}`, {
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

      const data = await res.json() as CreatePaymentResponse;
      setCreatedPaymentId(data.paymentId);
      setOrderId('');
      setPhoneNumber('');
      setPrice('');
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante la creazione del pagamento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog.Title>Nuovo pagamento manuale</Dialog.Title>
      <Dialog.Description size="2" color="gray" mb="4">
        Crea un pagamento Satispay direttamente da questa istanza.
      </Dialog.Description>

      <form onSubmit={handleSubmit}>
        <Flex direction="column" gap="4">
          <Box>
            <Text as="label" size="2" weight="medium" htmlFor="order-id">Order ID</Text>
            <Box mt="1">
              <TextField.Root
                id="order-id"
                placeholder="es. ORD-10024"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                required
                size="3"
              />
            </Box>
          </Box>

          <Box>
            <Text as="label" size="2" weight="medium" htmlFor="phone-number">Telefono cliente</Text>
            <Box mt="1">
              <TextField.Root
                id="phone-number"
                placeholder="+393331234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                size="3"
              />
            </Box>
          </Box>

          <Box>
            <Text as="label" size="2" weight="medium" htmlFor="payment-amount">Importo (EUR)</Text>
            <Box mt="1">
              <TextField.Root
                id="payment-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder="12.50"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                size="3"
              />
            </Box>
          </Box>

          {createdPaymentId && (
            <Callout.Root color="green" variant="soft">
              <Callout.Icon><CheckIcon /></Callout.Icon>
              <Callout.Text>
                Pagamento creato con ID{' '}
                <CopyableValue value={createdPaymentId} head={1} tail={1} color="green" />.
              </Callout.Text>
            </Callout.Root>
          )}

          {error && (
            <Callout.Root color="red" variant="soft">
              <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          <Flex gap="2" justify="end">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray">
                Chiudi
              </Button>
            </Dialog.Close>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creazione…' : 'Crea pagamento'}
            </Button>
          </Flex>
        </Flex>
      </form>
    </>
  );
}
