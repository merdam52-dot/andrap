# PRESA

Protótipo mobile de sobrevivência — tensão à la DayZ, em loop curto.

Sob a marca **Minha Aposentadoria**: você é a presa na zona. Escassez, visão limitada, infectados que escutam. Não é open world; é uma run viciante de poucos minutos.

## Como rodar

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080` (ou `http://127.0.0.1:8080`) no celular ou no desktop.

## Como jogar

1. Toque em **Entrar na zona**.
2. **Arraste** para caminhar — movimento gera **ruído**; parado, você some do radar.
3. Visão é curta. Explore o escuro em busca de **comida** (dourado) e **supplies** (verde-sujo).
4. **Fome** sempre cai. Sem loot, você morre. Infectados vagueiam; se te ouvem ou veem, perseguem — lentos, mas implacáveis.
5. Uma colisão ou fome zerada = fim. **Tentar de novo** reinicia na hora.

Desktop: arraste com o mouse; `Espaço` / `Enter` inicia ou reinicia.

Recorde (mais tempo vivo) fica no `localStorage`.

## Direção

- Escassez + vulnerabilidade, não arcade de reflexo.
- HUD mínimo: tempo, fome, ruído.
- Feedback tátil (vibração), shake e batida sonora na morte.
- Paleta lama / ferrugem / osso — sem roxo “AI default”.

## Stack

HTML + CSS + Canvas 2D + Web Audio. Sem frameworks.
