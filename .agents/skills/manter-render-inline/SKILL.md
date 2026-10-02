# Manter lógica de render e props inline

## Objetivo

Evite indireção desnecessária em componentes React. Não crie variáveis intermediárias apenas para decidir renderização ou resolver props.

## Evitar

- Variáveis `defaultX`, `resolvedX`, `hasX` ou `computedX` usadas só no JSX.
- `prop || {}` e defaults fora do parâmetro quando servem apenas para adereços.
- Variáveis de condição que só mudam qual elemento é renderizado.

## Preferir

- Condições inline no JSX.
- Props passadas diretamente.
- Padrões no parâmetro da função quando necessário.

```jsx
function Panel({ actions = [], searchProps = {} }) {
  return <section>{actions.length > 0 && <Actions items={actions} />}<Search {...searchProps} /></section>;
}
```

## Revisão

- Procure `resolvedX`, `defaultX`, `hasX` e `computedX` nos componentes.
- Confira se algum `|| {}` existe somente para montar props.
- Deixe decisões de render inline.
- Use padrões nos parâmetros quando forem valores padrão.

Dados derivados para cálculos reais de domínio continuam válidos; esta orientação trata somente de atalhos de renderização e adereços.
