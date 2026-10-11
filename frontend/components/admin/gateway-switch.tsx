'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio';
import { useToast } from '@/components/ui/toast';
import { type PaymentGatewayId, fetchPaymentGateway, setPaymentGateway } from '@/lib/api/admin';
import { errorMessage } from '@/lib/api/errors';

export const GATEWAY_LABEL: Record<string, string> = {
  cashfree: 'Cashfree',
  razorpay: 'Razorpay',
};

export const PAYMENT_GATEWAY_QUERY_KEY = ['admin-payment-gateway'] as const;

/**
 * Which gateway checkout uses. The change is live for the next checkout; a
 * booking already in progress keeps the gateway it started on (its order
 * exists there), so nothing mid-payment is moved. A gateway this server has no
 * credentials for is shown but cannot be chosen — it says why instead of
 * offering a control that can only fail.
 */
export function GatewaySwitch() {
  const client = useQueryClient();
  const { toast } = useToast();
  const { data, isPending, isError } = useQuery({
    queryKey: PAYMENT_GATEWAY_QUERY_KEY,
    queryFn: fetchPaymentGateway,
  });
  const [choice, setChoice] = React.useState<PaymentGatewayId | null>(null);

  const save = useMutation({
    mutationFn: (gateway: PaymentGatewayId) => setPaymentGateway(gateway),
    onSuccess: (next) => {
      client.setQueryData(PAYMENT_GATEWAY_QUERY_KEY, next);
      setChoice(null);
      toast({
        title: `Checkout now uses ${GATEWAY_LABEL[next.active] ?? next.active}`,
        variant: 'success',
      });
    },
    onError: (error) => toast({ title: errorMessage(error), variant: 'destructive' }),
  });

  if (isPending) {
    return <div className="h-32 animate-pulse rounded-xl border border-border bg-surface" />;
  }
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
        The gateway setting could not be loaded.
      </div>
    );
  }

  const selected = choice ?? data.active;
  const dirty = selected !== data.active;

  return (
    <section
      aria-labelledby="gateway-switch-title"
      className="rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <h2 id="gateway-switch-title" className="text-base font-semibold text-foreground">
        Checkout payment gateway
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Customers pay through the gateway chosen here. A booking already in progress finishes on the
        gateway it started with.
      </p>

      <RadioGroup
        value={selected}
        onValueChange={(value) => setChoice(value as PaymentGatewayId)}
        className="mt-4"
      >
        {data.gateways.map((gateway) => (
          <label
            key={gateway.id}
            htmlFor={`gateway-${gateway.id}`}
            className="flex items-start gap-3 rounded-lg border border-border p-3 has-[:disabled]:opacity-60"
          >
            <RadioGroupItem
              id={`gateway-${gateway.id}`}
              value={gateway.id}
              disabled={!gateway.configured}
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {GATEWAY_LABEL[gateway.id] ?? gateway.id}
                {gateway.id === data.active ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    · in use now
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {!gateway.configured
                  ? 'Not available: its keys are not set on the server.'
                  : gateway.can_pay_out
                    ? 'Takes payments and pays organizers.'
                    : 'Takes payments. Cannot pay organizers yet.'}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>

      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          disabled={!dirty}
          loading={save.isPending}
          onClick={() => save.mutate(selected)}
        >
          Switch gateway
        </Button>
      </div>
    </section>
  );
}
