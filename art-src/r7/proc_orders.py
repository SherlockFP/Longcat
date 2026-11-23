"""R10 adoption orders art: the Adopted Cats basket, the VIP rosette, the Urgent alarm clock (orders_ui.png, drawn by
studio/bin/art.sh one at a time): magenta key, slice, fit, webp -> public/assets/r7/.  usage: python proc_orders.py"""
from proc7 import key, load, slice_sheet, fit, save

for n, im in zip(['ord_basket', 'ord_vip', 'ord_urgent'], slice_sheet(key(load('orders_ui')), 1, 3)):
    save(fit(im, 160, 160, 0.03), n)
print('ok')
