import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

plt.rcParams.update({"mathtext.fontset": "cm", "text.color": "#ececec"})
OUT = sys.argv[1]
EQ = {
    "e1": r"$e=\dfrac{q\,p}{\varepsilon+(1-\varepsilon)\,q},\qquad \mathrm{RH_i}=\dfrac{e}{e_i(T)},\qquad \mathrm{RH_w}=\dfrac{e}{e_w(T)},\qquad \varepsilon=0.622$",
    "e2": r"$\ln e_i(T)=9.550426-\dfrac{5723.265}{T}+3.53068\,\ln T-0.00728332\,T$",
    "e3a": r"$\ln e_w(T)=54.842763-\dfrac{6763.22}{T}-4.210\,\ln T+0.000367\,T$",
    "e3b": r"$\qquad\qquad+\;\tanh\!\left[0.0415\,(T-218.8)\right]\left(53.878-\dfrac{1331.22}{T}-9.44523\,\ln T+0.014025\,T\right)$",
    "e4": r"$G=\dfrac{EI_{\mathrm{H_2O}}\;c_p\;p}{\varepsilon\,Q\,(1-\eta)},\qquad \left.\dfrac{d e_w}{dT}\right|_{T_{LM}}=G$",
    "e5": r"$e_w(T_{LM})-G\,(T_{LM}-T_{LC})=\mathrm{RH_w}\;e_w(T_{LC})\quad(\mathrm{RH_w}<1),\qquad T_{LC}=T_{LM}\quad(\mathrm{RH_w}\geq 1)$",
    "e6": r"$\mathrm{forms}:\;T\leq T_{LC},\qquad \mathrm{persists\_raw}:\;\mathrm{forms}\;\wedge\;\mathrm{RH_i}\geq 1$",
    "e7": r"$\eta=\dfrac{F\,V_{\mathrm{TAS}}}{\dot m_f\,Q},\qquad F=D+m\,g\,\dfrac{\dot h}{V_{\mathrm{TAS}}},\qquad 0.20\leq\eta\leq 0.45\;\;(\mathrm{clipped,\ flagged})$",
    "e8": r"$p(h)=p_0\left(1-\dfrac{L\,h}{T_0}\right)^{g/(R_dL)}\;(h\leq 11\,\mathrm{km}),\qquad p(h)=p_{11}\,\exp\!\left[-\dfrac{g\,(h-h_{11})}{R_d\,T_{11}}\right]\;(h>11\,\mathrm{km})$",
    "e9": r"$\mathbf{x}_{k+1}=\mathbf{x}_k+\dfrac{\Delta t}{2}\left[\mathbf{v}(\mathbf{x}_k,t_k)+\mathbf{v}\!\left(\mathbf{x}_k+\Delta t\,\mathbf{v}(\mathbf{x}_k,t_k),\,t_{k+1}\right)\right],\qquad \Delta t\leq 5\ \mathrm{min}$",
    "e10": r"$d_{\mathrm{par}}\approx h\,\tan\theta_{\mathrm{VZA}}$",
    "e11": r"$\mathrm{BS}=\dfrac{1}{N}\sum_{i=1}^{N}(p_i-y_i)^2,\qquad \mathrm{BSS}=1-\dfrac{\mathrm{BS_{STRATUM}}}{\mathrm{BS_{B3}}}$",
    "e12": r"$R_{\mathrm{H1}}=\dfrac{\sum_{i\in\mathcal{O}}\mathbf{1}[\mathrm{B1\ persists}_i]}{\sum_{i\in\mathcal{O}}y_i},\qquad \mathcal{O}=\{\mathrm{SAC\text{-}forming,\ observable\ segments}\}$",
    "e13a": r"$s^{*}=\min\left\{\dfrac{\ell}{L}:\;\dfrac{\mathrm{EF}^{+}(\mathrm{top\ segments\ covering\ distance}\ \ell)}{\mathrm{EF}^{+}_{\mathrm{total}}}\geq 0.80\right\}$",
    "e13b": r"$\Delta_{\mathrm{night}}=\dfrac{\mathrm{EF}^{+}_{\mathrm{night}}}{\mathrm{EF}^{+}_{\mathrm{total}}}-\dfrac{L_{\mathrm{night}}}{L},\qquad \mathrm{night}=18{:}00\mathrm{-}06{:}00\ \mathrm{local\ solar\ time}$",
    "e14": r"$\mathrm{E}\left[N_{+}(g,s)\right]=N_{\mathrm{cand}}(g)\;f_{\mathrm{obs}}(g,s)\;p_{+}(g,s),\qquad N_{\mathrm{cand}}(g)\geq\dfrac{300}{f_{\mathrm{obs}}(g,s)\;p_{+}(g,s)}$",
    "e15": r"$\mathrm{NB}_H=\kappa_H\,\left(\mathrm{EF}_{\mathrm{planned}}-\mathrm{EF}_{\mathrm{alt}}\right)-\left(m_{\mathrm{CO_2,alt}}-m_{\mathrm{CO_2,planned}}\right),\qquad H\in\{20,100\}\ \mathrm{yr},\quad \kappa_H=\ \mathrm{open\ (Q5)}$",
}
for k, tex in EQ.items():
    fig = plt.figure(figsize=(0.01, 0.01))
    fig.text(0, 0, tex, fontsize=13)
    fig.savefig(f"{OUT}/{k}.png", dpi=300, transparent=True, bbox_inches="tight", pad_inches=0.03)
    plt.close(fig)
    print("ok", k)
