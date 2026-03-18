import { Link as RouterLink } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Grid,
  Heading,
  Link,
  Separator,
  Text,
} from '@radix-ui/themes';

export function WelcomePage() {
  return (
    <Box style={{ minHeight: '100svh' }}>
      <Flex
        align="center"
        justify="between"
        px="6"
        py="4"
        style={{ borderBottom: '1px solid var(--gray-a4)' }}
      >
        <Heading size="5" style={{ letterSpacing: '-0.5px' }}>Muvat</Heading>
        <Flex gap="3" align="center">
          <Link asChild size="2" color="gray" highContrast>
            <RouterLink to="/login">Accedi</RouterLink>
          </Link>
          <Button asChild size="2">
            <RouterLink to="/register">Crea account</RouterLink>
          </Button>
        </Flex>
      </Flex>

      <Container size="3">
        <Flex direction="column" align="center" gap="6" py="9" style={{ textAlign: 'center' }}>
          <Badge color="violet" variant="soft" size="2" radius="full">
            Gateway Satispay multi-tenant
          </Badge>
          <Heading
            size="9"
            style={{ letterSpacing: '-2px', lineHeight: '1.05', maxWidth: 680 }}
          >
            Gestisci i tuoi pagamenti Satispay
          </Heading>
          <Text size="4" color="gray" style={{ maxWidth: 520, lineHeight: '1.65' }}>
            Muvat è il gateway multi-tenant per accettare pagamenti Satispay,
            monitorare le transazioni in tempo reale e gestire più casse dallo
            stesso pannello.
          </Text>
          <Flex gap="3">
            <Button size="3" asChild>
              <RouterLink to="/register">Crea account gratuito</RouterLink>
            </Button>
            <Button size="3" variant="soft" asChild>
              <RouterLink to="/login">Accedi</RouterLink>
            </Button>
          </Flex>
        </Flex>
      </Container>

      <Separator size="4" />

      <Container size="3" py="8">
        <Grid columns={{ initial: '1', sm: '3' }} gap="4">
          <Card size="3">
            <Flex direction="column" gap="2">
              <Heading size="3">Multi-cassa</Heading>
              <Text size="2" color="gray">
                Configura più istanze Satispay per ogni punto vendita o cassa.
              </Text>
            </Flex>
          </Card>
          <Card size="3">
            <Flex direction="column" gap="2">
              <Heading size="3">Real-time</Heading>
              <Text size="2" color="gray">
                Ricevi aggiornamenti istantanei sullo stato dei pagamenti via WebSocket.
              </Text>
            </Flex>
          </Card>
          <Card size="3">
            <Flex direction="column" gap="2">
              <Heading size="3">Multi-tenant</Heading>
              <Text size="2" color="gray">
                Ogni tenant ha il proprio spazio isolato con dati e chiavi separate.
              </Text>
            </Flex>
          </Card>
        </Grid>
      </Container>
    </Box>
  );
}
