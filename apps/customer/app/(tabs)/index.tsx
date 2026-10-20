import { useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Icon } from "@/components/Icon";
import { LangToggle } from "@/components/LangToggle";
import { ProductCard } from "@/components/ProductCard";
import { useCategories, useProducts } from "@/hooks/useCatalog";
import { supabase } from "@/lib/supabase";
import { useT, type TKey } from "@/i18n";
import { radius, useTheme } from "@/theme";

const chicken = require("../../assets/images/chicken.jpg");

/** Storage path → public URL; falls back to the bundled sample photo until real images are uploaded. */
function productImage(path: string | null) {
  if (!path) return chicken;
  return { uri: supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl };
}

function greetingKey(): TKey {
  const h = new Date().getHours();
  return h < 12 ? "greetingMorning" : h < 17 ? "greetingAfternoon" : "greetingEvening";
}

export default function HomeScreen() {
  const { c } = useTheme();
  const t = useT();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const categories = useCategories();
  const products = useProducts(categoryId);

  const refreshing = categories.isRefetching || products.isRefetching;
  const onRefresh = () => {
    categories.refetch();
    products.refetch();
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24, gap: 18 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
                <Icon name="logo" color="#FFFFFF" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="subtitle" style={{ fontSize: 17 }} numberOfLines={1}>{t(greetingKey())}</AppText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Icon name="pin" color={c.primary} size={13} strokeWidth={2.4} />
                  <AppText variant="caption" muted numberOfLines={1} style={{ flexShrink: 1 }}>{t("deliverTo")}</AppText>
                  <Icon name="chevronDown" color={c.muted} size={13} strokeWidth={2.6} />
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <LangToggle />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="bell" color={c.ink} size={18} />
              </Pressable>
            </View>
          </View>

          {/* Search with voice button */}
          <Pressable
            accessibilityRole="search"
            style={{ flexDirection: "row", alignItems: "center", gap: 10, height: 54, paddingLeft: 18, paddingRight: 7, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border }}
          >
            <Icon name="search" color={c.muted} size={20} />
            <AppText variant="bodyBold" muted style={{ flex: 1 }} numberOfLines={1}>{t("searchPlaceholder")}</AppText>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
              <Icon name="mic" color="#FFFFFF" size={18} />
            </View>
          </Pressable>
        </View>

        {/* Category bubbles */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
          {[{ id: null as string | null, name: t("all") }, ...(categories.data ?? [])].map((cat) => {
            const selected = categoryId === cat.id;
            return (
              <Pressable
                key={cat.id ?? "all"}
                onPress={() => setCategoryId(cat.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{ alignItems: "center", gap: 6, width: 68 }}
              >
                <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: selected ? c.primary : c.border, padding: 3 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, overflow: "hidden", backgroundColor: c.tint }}>
                    <Image source={chicken} resizeMode="cover" style={{ width: 52, height: 52 }} />
                  </View>
                </View>
                <AppText variant={selected ? "label" : "caption"} color={selected ? c.primary : c.ink} numberOfLines={1}>
                  {cat.name}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* AI suggestion */}
        <View style={{ marginHorizontal: 20, flexDirection: "row", gap: 12, padding: 14, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center" }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
            <Icon name="sparkle" color={c.primary} size={22} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label" color={c.price} style={{ fontSize: 10, letterSpacing: 0.6 }}>{t("aiLabel")}</AppText>
            <AppText variant="subtitle" style={{ fontSize: 15, lineHeight: 19 }}>{t("aiSuggestion")}</AppText>
            <AppText variant="caption" muted>₹ 1,260 · {t("aiMeta")}</AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: pressed ? c.primaryPressed : c.primary, justifyContent: "center" })}
          >
            <AppText variant="label" color="#FFFFFF" style={{ fontSize: 13 }}>{t("order")}</AppText>
          </Pressable>
        </View>

        {/* Popular products */}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 20 }}>
            <AppText variant="title">{t("popularToday")}</AppText>
            <AppText variant="label" color={c.price}>{t("seeAll")}</AppText>
          </View>

          {products.isError ? (
            <AppText muted style={{ paddingHorizontal: 20 }}>{t("loadError")}</AppText>
          ) : (
            <FlatList
              horizontal
              data={products.data ?? []}
              keyExtractor={(p) => p.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
              renderItem={({ item }) => (
                <ProductCard name={item.name} pricePerKg={Number(item.base_price_per_kg)} image={productImage(item.image_path)} />
              )}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
