from django.core.management.base import BaseCommand, CommandError

from api.lightning.node import LNNode
from api.models import LNPayment, Order
from api.logics import Logics

from django.utils import timezone
from decouple import config
from base64 import b64decode
import time

MACAROON = b64decode(config('LND_MACAROON_BASE64'))

class Command(BaseCommand):
    '''
    Background: SubscribeInvoices stub iterator would be great to use here.
    However, it only sends updates when the invoice is OPEN (new) or SETTLED.
    We are very interested on the other two states (CANCELLED and ACCEPTED).
    Therefore, this thread (follow_invoices) will iterate over all LNpayment
    objects and do InvoiceLookupV2 every X seconds to update their state 'live' 
    '''

    help = 'Follows all active hold invoices'
    rest = 5 # seconds between consecutive checks for invoice updates

    # def add_arguments(self, parser):
    #     parser.add_argument('debug', nargs='+', type=boolean)

    def follow_invoices(self, *args, **options):
        ''' Follows and updates LNpayment objects
        until settled or canceled'''

        # TODO handle 'database is locked'
        
        lnd_state_to_lnpayment_status = {
                0: LNPayment.Status.INVGEN, # OPEN
                1: LNPayment.Status.SETLED, # SETTLED
                2: LNPayment.Status.CANCEL, # CANCELLED
                3: LNPayment.Status.LOCKED  # ACCEPTED
            }

        stub = LNNode.invoicesstub

        while True:
            time.sleep(self.rest)

            # time it for debugging
            t0 = time.time()
            queryset = LNPayment.objects.filter(type=LNPayment.Types.HOLD, status__in=[LNPayment.Status.INVGEN, LNPayment.Status.LOCKED])

            debug = {}
            debug['num_active_invoices'] = len(queryset)
            debug['invoices'] = []
            at_least_one_changed = False

            for idx, hold_lnpayment in enumerate(queryset):
                old_status = LNPayment.Status(hold_lnpayment.status).label
                
                try:
                    request = LNNode.invoicesrpc.LookupInvoiceMsg(payment_hash=bytes.fromhex(hold_lnpayment.payment_hash))
                    response = stub.LookupInvoiceV2(request, metadata=[('macaroon', MACAROON.hex())])
                    hold_lnpayment.status = lnd_state_to_lnpayment_status[response.state]

                except Exception as e:
                    # If it fails at finding the invoice it has been canceled.
                    # On RoboSats DB we make a distinction between cancelled and returned (LND does not)
                    if 'unable to locate invoice' in str(e): 
                        self.stdout.write(str(e))
                        hold_lnpayment.status = LNPayment.Status.CANCEL
                    # LND restarted.
                    if 'wallet locked, unlock it' in str(e):
                        self.stdout.write(str(timezone.now())+':: Wallet Locked')
                    # Other write to logs
                    else:
                        self.stdout.write(str(e))
                
                new_status = LNPayment.Status(hold_lnpayment.status).label

                # Only save the hold_payments that change (otherwise this function does not scale)
                changed = not old_status==new_status
                if changed:
                    # self.handle_status_change(hold_lnpayment, old_status)
                    hold_lnpayment.save()
                    self.update_order_status(hold_lnpayment)

                    # Report for debugging
                    new_status = LNPayment.Status(hold_lnpayment.status).label
                    debug['invoices'].append({idx:{
                        'payment_hash': str(hold_lnpayment.payment_hash),
                        'old_status': old_status,
                        'new_status': new_status,
                    }})

                at_least_one_changed = at_least_one_changed or changed
            
            debug['time']=time.time()-t0

            if at_least_one_changed:
                self.stdout.write(str(timezone.now()))
                self.stdout.write(str(debug))


    def update_order_status(self, lnpayment):
        ''' Background process following LND hold invoices
        can catch LNpayments changing status. If they do,
        the order status might have to change too.'''

        # If the LNPayment goes to LOCKED (ACCEPTED)
        if lnpayment.status == LNPayment.Status.LOCKED:
            try:
                # It is a maker bond => Publish order.
                if hasattr(lnpayment, 'order_made' ):
                    Logics.publish_order(lnpayment.order_made)
                    return

                # It is a taker bond => close contract.
                elif hasattr(lnpayment, 'order_taken' ):
                    if lnpayment.order_taken.status == Order.Status.TAK:
                        Logics.finalize_contract(lnpayment.order_taken)
                        return

                # It is a trade escrow => move foward order status.
                elif hasattr(lnpayment, 'order_escrow' ):
                    Logics.trade_escrow_received(lnpayment.order_escrow)
                    return
            except Exception as e:
                self.stdout.write(str(e))

        # TODO If a lnpayment goes from LOCKED to INVGED. Totally weird
        # halt the order
        if lnpayment.status == LNPayment.Status.LOCKED:
            pass

    def handle(self, *args, **options):
        ''' Never mind database locked error, keep going, print them out'''
        
        try:
            self.follow_invoices()
        except Exception as e:
            if 'database is locked' in str(e):
                self.stdout.write('database is locked')
            
            self.stdout.write(e)