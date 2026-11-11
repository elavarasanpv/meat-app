import { Link } from "react-router-dom";

/**
 * Public Terms & Privacy pages (no login). Linked from the customer and
 * partner apps' sign-in screens and used as the Play Store privacy URL.
 * Business details live in BUSINESS so they are easy to update in one place.
 */
const BUSINESS = {
  brand: "FreshCut",
  /** Legal name of the business that runs FreshCut. */
  legalName: "FreshCut",
  address: "Chettikulam, Tirunelveli district, Tamil Nadu, India",
  email: "support@freshcut.in",
  /** Shown as the data-protection contact as well. */
  updated: "11 November 2026",
};

function Page({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ground text-[15px] leading-relaxed">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2 font-extrabold text-ink">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-white">F</span>
            {BUSINESS.brand}
          </Link>
          <nav className="flex gap-4 text-[13px] font-bold text-muted">
            <Link to="/terms" className="hover:text-ink">Terms</Link>
            <Link to="/privacy" className="hover:text-ink">Privacy</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8 pb-16">
        <h1 className="text-[28px] font-extrabold leading-tight">{title}</h1>
        <p className="mt-1 text-[13px] text-muted">Last updated {BUSINESS.updated}</p>
        <p className="mt-5 text-muted">{intro}</p>
        <div className="legal mt-6 space-y-7">{children}</div>
        <footer className="mt-12 border-t border-line pt-5 text-[13px] text-muted">
          Questions? Write to <a className="font-bold text-primary" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
        </footer>
      </main>
    </div>
  );
}

function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[18px] font-extrabold">{title}</h2>
      <div className="mt-2 space-y-2 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>
    </section>
  );
}

export function Terms() {
  return (
    <Page title="Terms of Service" intro={`These terms apply when you use the ${BUSINESS.brand} apps and website to order fresh meat, or to supply or deliver it as a partner shop or rider. By creating an account you agree to them.`}>
      <S title="1. Who we are">
        <p>{BUSINESS.brand} is run by {BUSINESS.legalName}, {BUSINESS.address}. We connect you with local meat shops and delivery riders; the shop prepares your order and the rider brings it to your door.</p>
      </S>
      <S title="2. Your account">
        <ul>
          <li>You must be 18 or older to order.</li>
          <li>You sign in with your mobile number and a one-time code. Keep your phone safe: anyone with it can order on your account.</li>
          <li>Give us a correct delivery address and keep your phone reachable during your delivery slot.</li>
        </ul>
      </S>
      <S title="3. Orders, weight and price">
        <ul>
          <li>Meat is sold by weight. The price shown at checkout is an estimate based on the quantity you asked for.</li>
          <li>The shop weighs your order and photographs the scale. The final bill is based on the actual weight, so it can be a little above or below the estimate.</li>
          <li>If an item is unavailable, the shop removes it from your order and the bill drops by that amount. You are told in the app.</li>
          <li>Prices include everything you pay at the door. Delivery is free above the amount shown in the app; otherwise a small delivery fee applies.</li>
        </ul>
      </S>
      <S title="4. Delivery">
        <ul>
          <li>You pick a delivery slot when you order. We aim to deliver within it, but weather, traffic and shop load can cause delays. We will tell you in the app when that happens.</li>
          <li>The rider hands over your order against the 4-digit code shown in your app. Share it only with the rider at your door.</li>
          <li>If nobody is available at the address and you cannot be reached, the order may be marked as failed and returned to the shop. Fresh meat cannot be re-delivered later.</li>
        </ul>
      </S>
      <S title="5. Payment">
        <p>You pay the rider at the door, in cash or by UPI, for the final billed amount. We do not store card or bank details. Online prepaid payment, when introduced, will come with its own refund terms.</p>
      </S>
      <S title="6. Changing or cancelling an order">
        <ul>
          <li>You can add items or cancel free of charge until the shop accepts your order. After that the shop has started cutting for you, so the order cannot be cancelled from the app.</li>
          <li>If something is wrong with a delivered order, raise it from the order screen within 24 hours of delivery. Credits for a valid complaint are added to your {BUSINESS.brand} wallet or refunded the way you paid.</li>
        </ul>
      </S>
      <S title="7. Ratings and conduct">
        <p>You may rate products, the rider and the app. Keep ratings and notes honest and respectful. We may remove abusive content and suspend accounts that misuse the service, place repeated false orders, or mistreat shop staff or riders.</p>
      </S>
      <S title="8. Partner shops and riders">
        <ul>
          <li>Shops must hold a valid FSSAI licence, sell only fresh, hygienic produce, weigh accurately and photograph the scale for every item.</li>
          <li>Riders must hold a valid driving licence, carry orders in the insulated bag provided, deliver only against the customer's code and hand over the cash collected as agreed.</li>
          <li>While online, riders share their live location with us so customers can follow their delivery. See the Privacy Policy.</li>
          <li>Partner payouts, commission and cash settlement follow the separate partner agreement you signed with us.</li>
        </ul>
      </S>
      <S title="9. Our responsibility">
        <p>We take care to list only licensed shops and to deliver promptly, but we are a marketplace: the shop is responsible for the quality and weight of what it sells. Our liability for any order is limited to the amount you paid for it. Nothing here limits rights you have under the Consumer Protection Act, 2019.</p>
      </S>
      <S title="10. Changes and governing law">
        <p>We may update these terms; the date at the top shows the latest version, and continued use means you accept it. These terms are governed by the laws of India, and disputes are subject to the courts of Tirunelveli, Tamil Nadu.</p>
      </S>
      <S title="11. Contact">
        <p>{BUSINESS.legalName}, {BUSINESS.address}. Email <a className="font-bold text-primary" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>, or use the Help tab in the app.</p>
      </S>
    </Page>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy" intro={`This policy explains what ${BUSINESS.brand} collects from customers, partner shops and riders, why, and the choices you have. We keep it short and in plain words; if anything is unclear, write to us.`}>
      <S title="1. What we collect">
        <ul>
          <li><b>Account:</b> your mobile number (used to sign in with a one-time code), your name, and the language you choose.</li>
          <li><b>Addresses and location:</b> the delivery addresses you save and, if you allow it, your phone's location to place the pin accurately. We only check whether you are in an area we serve.</li>
          <li><b>Orders:</b> what you ordered, the weight and price, the slot, how you paid, and the scale photo the shop takes.</li>
          <li><b>Ratings and support messages:</b> stars, tags and notes you leave, and anything you send to support, including photos you attach.</li>
          <li><b>Voice search:</b> when you tap the microphone, the short clip is sent to our speech provider to turn it into text, then discarded. We do not keep recordings.</li>
          <li><b>Device:</b> a push-notification token so we can tell you about your order, and basic app and error logs.</li>
          <li><b>Riders only:</b> your live location while you are online in the partner app, including in the background, so customers can follow their delivery and your trip distance can be counted. Location sharing stops when you go offline or log out.</li>
          <li><b>Shops only:</b> shop details, opening hours, stock and prices you set, and the scale photos you take.</li>
        </ul>
      </S>
      <S title="2. Why we use it">
        <ul>
          <li>To take, prepare and deliver your orders and to let you track them.</li>
          <li>To show the shop what to prepare and the rider where to go.</li>
          <li>To send order updates by push notification or SMS.</li>
          <li>To handle complaints, credits and refunds.</li>
          <li>To improve the app, for example which products are popular in your area.</li>
          <li>To keep the service safe: spotting fraud, abuse and repeated failed deliveries.</li>
        </ul>
        <p>We do not sell your data and we do not use it for third-party advertising.</p>
      </S>
      <S title="3. Who sees it">
        <ul>
          <li><b>The shop preparing your order</b> sees your name, the items and your delivery area.</li>
          <li><b>The rider delivering it</b> sees your name, address and phone number, only for that delivery.</li>
          <li><b>Service providers</b> that run the app for us: Supabase (database and sign-in), Render (our server), Google (maps and push notifications), Sarvam AI (speech-to-text for voice search) and our SMS provider for one-time codes. They process data only on our instructions.</li>
          <li><b>Authorities</b> when the law requires it.</li>
        </ul>
      </S>
      <S title="4. How long we keep it">
        <p>Order history is kept for as long as your account exists and for up to 3 years afterwards for accounts, tax and dispute purposes. Rider location points are kept for 30 days. Voice clips are not stored. Support conversations are kept for 1 year after they close.</p>
      </S>
      <S title="5. Your choices and rights">
        <ul>
          <li><b>Location:</b> you can turn it off in your phone's settings; you can still type an address.</li>
          <li><b>Notifications:</b> turn them off in your phone's settings. You may then miss delivery updates.</li>
          <li><b>See or correct your data:</b> your addresses, orders and ratings are visible in the app. Write to us for anything else.</li>
          <li><b>Delete your account:</b> email <a className="font-bold text-primary" href={`mailto:${BUSINESS.email}?subject=Delete my ${BUSINESS.brand} account`}>{BUSINESS.email}</a> from any address with your registered mobile number. We confirm by OTP and delete your account within 7 days, keeping only what the law requires us to keep.</li>
        </ul>
        <p>These rights follow India's Digital Personal Data Protection Act, 2023. We will answer within 30 days.</p>
      </S>
      <S title="6. Security">
        <p>Data travels encrypted between your phone and our servers. Access inside the company is limited to the people who need it to run the service. No system is perfectly secure, so please keep your phone and sign-in code private.</p>
      </S>
      <S title="7. Children">
        <p>{BUSINESS.brand} is for adults. We do not knowingly collect data from anyone under 18; if you believe a child has created an account, write to us and we will remove it.</p>
      </S>
      <S title="8. Changes">
        <p>If we change this policy in a way that matters, we will tell you in the app before it takes effect. The date at the top shows the latest version.</p>
      </S>
      <S title="9. Contact">
        <p>{BUSINESS.legalName}, {BUSINESS.address}. Email <a className="font-bold text-primary" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.</p>
      </S>
    </Page>
  );
}
