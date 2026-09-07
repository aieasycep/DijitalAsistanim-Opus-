import type { ReactNode } from 'react'

type LegalPageProps = {
  readonly title: string
  readonly lede: string
  readonly updatedAt: string
  readonly children: ReactNode
}

const proseClasses = [
  'mt-10 max-w-none text-[16px] leading-8 text-muted',
  '[&_h2]:mt-12 [&_h2]:scroll-mt-24 [&_h2]:text-[22px] [&_h2]:leading-tight [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink sm:[&_h2]:text-[24px]',
  '[&_h3]:mt-8 [&_h3]:text-[17px] [&_h3]:font-semibold [&_h3]:text-ink',
  '[&_p]:mt-4',
  '[&_ul]:mt-4 [&_ul]:space-y-2.5 [&_ul]:pl-5 [&_ul]:list-disc',
  '[&_ol]:mt-4 [&_ol]:space-y-2.5 [&_ol]:pl-5 [&_ol]:list-decimal',
  '[&_li]:pl-1',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
  '[&_strong]:font-semibold [&_strong]:text-ink',
  '[&_code]:rounded [&_code]:bg-surface2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[14px] [&_code]:text-ink',
  '[&_table]:mt-6 [&_table]:w-full [&_table]:text-left [&_table]:text-[15px]',
  '[&_th]:border-b [&_th]:border-hairline [&_th]:py-2.5 [&_th]:pr-4 [&_th]:align-top [&_th]:font-semibold [&_th]:text-ink',
  '[&_td]:border-b [&_td]:border-hairline [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top',
].join(' ')

export function LegalPage({ title, lede, updatedAt, children }: LegalPageProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <header>
        <h1 className="text-[34px] leading-tight font-semibold tracking-tight text-ink sm:text-[42px]">
          {title}
        </h1>
        <p className="mt-4 text-[17px] leading-8 text-muted">{lede}</p>
        <p className="mt-4 text-[13px] text-faint">Son güncelleme: {updatedAt}</p>
      </header>

      <div className={proseClasses}>{children}</div>
    </div>
  )
}

type LegalTableProps = {
  readonly caption: string
  readonly head: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

export function LegalTable({ caption, head, rows }: LegalTableProps) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join('|')}>
              {row.map((cell, index) => (
                <td key={`${row[0] ?? 'row'}-${index}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
