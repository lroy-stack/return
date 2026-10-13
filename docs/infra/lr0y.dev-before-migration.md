# lr0y.dev — state before moving DNS to Cloudflare (captured 2026-10-13)

Registrar: Hostinger · status Active · transfer lock ON · DNSSEC: none (no DS) · expires 2027-05-14
Nameservers: ns1.dns-parking.com, ns2.dns-parking.com (Hostinger DNS)
Rollback: set the nameservers back to the two above in hPanel (the Hostinger zone below is left untouched).

| Name | Type | Content | TTL |
|---|---|---|---|
| @ | ALIAS | lr0y.dev.cdn.hstgr.net. | 300 |
| @ | MX | 5 mx1.hostinger.com. / 10 mx2.hostinger.com. | 14400 |
| @ | TXT | "v=spf1 include:_spf.mail.hostinger.com ~all" | 3600 |
| _dmarc | TXT | "v=DMARC1; p=none" | 3600 |
| www | CNAME | www.lr0y.dev.cdn.hstgr.net. | 300 |
| ftp | A | 91.108.101.10 | 1800 |
| autodiscover | CNAME | autodiscover.mail.hostinger.com. | 300 |
| autoconfig | CNAME | autoconfig.mail.hostinger.com. | 300 |
| hostingermail-a._domainkey | CNAME | hostingermail-a.dkim.mail.hostinger.com. | 300 |
| hostingermail-b._domainkey | CNAME | hostingermail-b.dkim.mail.hostinger.com. | 300 |
| hostingermail-c._domainkey | CNAME | hostingermail-c.dkim.mail.hostinger.com. | 300 |

Public answers at capture time: A 217.65.159.236, 217.65.156.65 · AAAA 2a02:4780:7f:fa25:6140:dace:d750:508d,
2a02:4780:80:640b:7f43:b4ba:1ab7:f1a2 (Hostinger CDN).

## Migration log (2026-10-13)
1. Cloudflare zone `lr0y.dev` (id <zone-id>, Free, full setup, no auto-import) — assigned NS
   carlane.ns.cloudflare.com / garret.ns.cloudflare.com.
2. Created the 11 records above, all DNS-only (apex ALIAS → flattened CNAME). Verified answer-by-answer against
   ns1.dns-parking.com: identical except apex A/AAAA, which both resolve from the same rotating Hostinger CDN host;
   the Cloudflare-resolved IPs serve the same site with a valid certificate (HTTP 200, same body).
3. Hostinger nameservers changed to the Cloudflare pair (API accepted, read-back confirmed). Activation check requested.
4. Registry delegation switched to Cloudflare within minutes; zone **active** 2026-10-13T11:57Z. Verified on 1.1.1.1 and
   8.8.8.8: website https://lr0y.dev and www → 200 with valid certificate; MX, SPF, DMARC, DKIM, autodiscover identical.
