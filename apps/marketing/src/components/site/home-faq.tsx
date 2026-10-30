import * as React from 'react'
import { FaqList } from './faq'
import { JsonLd } from './json-ld'
import { faqLd } from '../../lib/jsonld'
import { HOME_FAQS } from '../../lib/home-faq'

export function HomeFaq() {
  return (
    <section className="section scroll-mt-16" id="faq" aria-labelledby="home-faq-heading">
      <JsonLd data={faqLd(HOME_FAQS)} />
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">FAQ</p>
          <h2 id="home-faq-heading" className="t-h2 mt-4 text-foreground">
            Questions boards ask first.
          </h2>
        </div>
        <FaqList items={HOME_FAQS} />
      </div>
    </section>
  )
}
