using System;

class Program
{
    static void Main()
    {
        string s = "42";
        int a = Convert.ToInt32(s);
        double d = Convert.ToDouble("2.5");
        Console.WriteLine(a + d);
        Console.WriteLine(Convert.ToInt32(2.5) + Convert.ToInt32(3.5) + Convert.ToInt32(-0.5));
        Console.WriteLine(Convert.ToString(12) + Convert.ToString(true));
        Console.WriteLine("abc".Equals("abc"));
        Console.WriteLine(5.Equals(5));
    }
}
