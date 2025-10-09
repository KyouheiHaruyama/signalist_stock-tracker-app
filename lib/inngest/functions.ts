import {inngest} from "@/lib/inngest/client";
import {NEWS_SUMMARY_EMAIL_PROMPT, PERSONALIZED_WELCOME_EMAIL_PROMPT} from "@/lib/inngest/prompts";
import {sendNewsSummaryEmail, sendWelcomeEmail} from "@/lib/nodemailer";
import {getAllUsersForNewsMail} from "@/lib/actions/user.actions";
import {getWatchlistSymbolsByEmail} from "@/lib/actions/watchlist.actions";
import {getNews} from "@/lib/actions/finnhub.actions";
import {getFormatDateToday} from "@/lib/utils";

export const sendSignUpEmail = inngest.createFunction(
    { id: 'sign-up-email' },
    { event: 'app/user.created' },
    async ({ event, step }) => {
        const userProfile = `
            - Country: ${event.data.country}
            - Investment goals: ${event.data.investmentGoals}
            - Risk tolerance: ${event.data.riskTolerance}
            - Preferred industry: ${event.data.preferredIndustry}
        `;

        const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace('{{userProfile}}', userProfile);

        const response = await step.ai.infer('generate-welcome-intro', {
            model: step.ai.models.gemini({ model: 'gemini-2.5-flash-lite' }),
            body: {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: prompt }
                        ]
                    }
                ]
            }
        })

        await step.run('send-welcome-email', async () => {
            const part = response.candidates?.[0]?.content?.parts?.[0];
            const introText = (part && 'text' in part ? part.text : null) || 'Thanks for joining Signalist. You now have the tools to track markets and make smarter moves.';

            const { data: { email, name } } = event;
            return await sendWelcomeEmail({ email, name, intro: introText });
        })

        return {
            success: true,
            message: 'Welcome email sent successfully!'
        }
    }
);

// 以下は cron 式 cron: '0 12 * * *' のタイムラインと注意点の解説です。
// 要点
// - フォーマット（5フィールド）
//     - 分 時 日(1-31) 月(1-12) 曜日(0-6: 日=0または7)
//
// - '0 12 * * *' の意味
// - 毎日 12:00 ちょうど（正午）に実行
// - 日付や曜日に関係なく、1日に1回
//
// タイムゾーン
// - 実行時刻は「どのタイムゾーンで評価するか」に依存します。
//     - 多くのランタイムでは「サーバー（または実行環境）のローカルタイムゾーン」
//     - サーバーレスやマネージド環境では「UTC」がデフォルトのことが多い
//
// - 期待する現地時刻で動かしたい場合
// - 実行環境のタイムゾーンを設定（例: TZ=Asia/Tokyo）
//     - もしくは UTC 前提で式をオフセットして指定（正午JST=03:00 UTC）
//
// サマータイム（DST）の影響
// - ローカルタイムゾーンが DST を使う場合、12:00 実行は現地時間基準で動き、季節により UTC 側の実行時刻がずれます。
// - UTC で運用すれば DST の影響を受けません。
//
// フィールドの書き方（活用メモ）
// - ワイルドカード: *（全ての値）
// - 範囲: 8-18（8時〜18時）
// - リスト: 1,15（1日と15日）
// - ステップ: */15（15分ごと）、0 */6 * * *（6時間ごと）
// - 曜日と日付の同時指定は「OR」（どちらかに一致で実行）になる実装が一般的
//
// よくあるバリエーション例
// - 平日9:30だけ: 30 9 * * 1-5
// - 毎日6時間おき: 0 */6 * * *
// - 平日8〜18時に15分おき: */15 8-18 * * 1-5
// - 毎月1日0:00: 0 0 1 * *
// - 日曜の深夜0:00: 0 0 * * 0
// - 毎日23:59: 59 23 * * *
//
// 検証のコツ
// - 実行環境のタイムゾーン（TZ）をまず確認
// - 想定どおりかをテスト環境で短い間隔の式（例: */1 * * * *）に一時変更して動作確認
// - 外部の cron シミュレーターで次回実行時刻を確認（UTC/ローカルの切り替え可なものだとなお良い）
//
// この設定自体は「毎日正午に1回」ですが、環境タイムゾーンを明示しないと意図せぬ時間に動くことがあるため、TZ の確認・設定が最重要ポイントです。
export const sendDailyNewsSummary = inngest.createFunction(
    { id: 'daily-news-summary' },
    [ { event: 'app/send.daily.news' }, { cron: '0 12 * * *' } ],
    async ({ step }) => {
        // Step 1: Get all users for news delivery
        const users = await step.run('get-all-users', getAllUsersForNewsMail);
        if (!users || users.length === 0) return { success: false, message: 'No users found for news email' };

        // Step 2: Fetch personalized news for each user
        const results = await step.run('fetch-user-news', async () => {
            const perUser: Array<{ user: User; articles: MarketNewsArticle[] }> = [];
            for (const user of users as User[]) {
                try {
                    const symbols = await getWatchlistSymbolsByEmail(user.email);
                    let articles = await getNews(symbols);

                    // Enforce max 6 articles per user
                    articles = (articles || []).slice(0, 6);

                    // If still empty, fallback to general
                    if (!articles || articles.length === 0) {
                        articles = await getNews();
                        articles = (articles || []).slice(0, 6);
                    }

                    perUser.push({ user, articles });
                } catch (error) {
                    console.error('daily-news: error preparing user news', user.email, error);
                    perUser.push({ user, articles: [] });
                }
            }
            return perUser;
        });

        // Step 3: Summarize news via AI for each user
        const userNewsSummaries: { user: User, newsContent: string | null }[] = [];

        for (const { user, articles } of results) {
            try {
                const prompt = NEWS_SUMMARY_EMAIL_PROMPT.replace('{{newsData}}', JSON.stringify(articles, null, 2));

                const response = await step.ai.infer(`summarize-news-${user.email}`, {
                    model: step.ai.models.gemini({ model: 'gemini-2.5-flash-lite' }),
                    body: {
                        contents: [{ role: 'user', parts: [{ text:prompt}]}]
                    }
                });

                const part = response.candidates?.[0]?.content?.parts?.[0];
                const newsContent = (part && 'text' in part ? part.text : null) || 'No market news';

                userNewsSummaries.push({ user, newsContent });
            } catch (error) {
                console.error('Failed to summarize news for : ', user.email, error);
                userNewsSummaries.push({ user, newsContent: null });
            }
        }

        // Step 4: Send emails
        await step.run('send-news-emails', async () => {
            await Promise.all(
                userNewsSummaries.map(async ({ user, newsContent }) => {
                    if (!newsContent) return false;

                    return await sendNewsSummaryEmail({ email: user.email, date: getFormatDateToday(), newsContent })
                })
            )
        });

        return { success: true, message: 'Daily news summary emails sent successfully' } as const;
    }
)